use std::{
    io::{Read, Write},
    net::{TcpStream, ToSocketAddrs},
    thread,
    time::Duration,
};

use super::{log_lines, ManagedSidecar, SidecarStatus};

pub(crate) const DEFAULT_HEALTH_URL: &str = "http://127.0.0.1:18081/healthz";

#[derive(Debug, Clone)]
pub(crate) struct HealthProbeConfig {
    pub(crate) url: String,
    pub(crate) attempts: u8,
    pub(crate) timeout: Duration,
    pub(crate) retry_delay: Duration,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum HealthProbeOutcome {
    Ready,
    NotReady(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedHttpUrl {
    host: String,
    port: u16,
    path: String,
}

impl Default for HealthProbeConfig {
    fn default() -> Self {
        Self {
            url: DEFAULT_HEALTH_URL.into(),
            attempts: 12,
            timeout: Duration::from_millis(200),
            retry_delay: Duration::from_millis(100),
        }
    }
}

pub(crate) fn wait_for_health(config: &HealthProbeConfig) -> HealthProbeOutcome {
    let attempts = config.attempts.max(1);
    let mut last = String::from("health probe was not attempted");
    for attempt in 1..=attempts {
        match probe_health_once(&config.url, config.timeout) {
            HealthProbeOutcome::Ready => return HealthProbeOutcome::Ready,
            HealthProbeOutcome::NotReady(detail) => last = detail,
        }
        if attempt < attempts {
            thread::sleep(config.retry_delay);
        }
    }
    HealthProbeOutcome::NotReady(last)
}

pub(crate) fn probe_health_once(url: &str, timeout: Duration) -> HealthProbeOutcome {
    let parsed = match parse_http_url(url) {
        Ok(parsed) => parsed,
        Err(detail) => return HealthProbeOutcome::NotReady(detail),
    };
    let mut stream = match connect(&parsed, timeout) {
        Ok(stream) => stream,
        Err(detail) => return HealthProbeOutcome::NotReady(detail),
    };
    match write_request_and_read_status(&mut stream, &parsed) {
        Ok(status) if is_success_status(&status) => HealthProbeOutcome::Ready,
        Ok(status) => HealthProbeOutcome::NotReady(format!("health returned {status}")),
        Err(detail) => HealthProbeOutcome::NotReady(detail),
    }
}

fn parse_http_url(url: &str) -> Result<ParsedHttpUrl, String> {
    let rest = url
        .strip_prefix("http://")
        .ok_or_else(|| "health URL must use http://".to_string())?;
    let (authority, path) = rest
        .split_once('/')
        .map(|(authority, path)| (authority, format!("/{path}")))
        .unwrap_or((rest, "/".into()));
    let (host, port) = parse_authority(authority)?;
    Ok(ParsedHttpUrl { host, port, path })
}

fn parse_authority(authority: &str) -> Result<(String, u16), String> {
    if authority.is_empty() {
        return Err("health URL host is empty".into());
    }
    let (host, port) = authority
        .rsplit_once(':')
        .map_or((authority, 80), |(host, port)| {
            (host, port.parse::<u16>().unwrap_or(0))
        });
    if host.is_empty() || port == 0 {
        return Err(format!("health URL authority is invalid: {authority}"));
    }
    Ok((host.into(), port))
}

fn connect(parsed: &ParsedHttpUrl, timeout: Duration) -> Result<TcpStream, String> {
    let address = format!("{}:{}", parsed.host, parsed.port);
    let mut addrs = address
        .to_socket_addrs()
        .map_err(|err| format!("health address resolution failed: {err}"))?;
    let addr = addrs
        .next()
        .ok_or_else(|| format!("health address resolved no endpoints: {address}"))?;
    let stream = TcpStream::connect_timeout(&addr, timeout)
        .map_err(|err| format!("health connect failed: {err}"))?;
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|err| format!("health read timeout setup failed: {err}"))?;
    stream
        .set_write_timeout(Some(timeout))
        .map_err(|err| format!("health write timeout setup failed: {err}"))?;
    Ok(stream)
}

fn write_request_and_read_status(
    stream: &mut TcpStream,
    parsed: &ParsedHttpUrl,
) -> Result<String, String> {
    let request = format!(
        "GET {} HTTP/1.1\r\nHost: {}:{}\r\nConnection: close\r\n\r\n",
        parsed.path, parsed.host, parsed.port
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|err| format!("health request failed: {err}"))?;
    let mut buffer = [0_u8; 128];
    let read = stream
        .read(&mut buffer)
        .map_err(|err| format!("health response failed: {err}"))?;
    if read == 0 {
        return Err("health response was empty".into());
    }
    let response = String::from_utf8_lossy(&buffer[..read]);
    response
        .lines()
        .next()
        .map(str::to_string)
        .ok_or_else(|| "health response status line was missing".into())
}

fn is_success_status(status_line: &str) -> bool {
    status_line
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse::<u16>().ok())
        .is_some_and(|code| (200..300).contains(&code))
}

impl ManagedSidecar {
    pub(super) fn health_checked_status(&self, wait_for_readiness: bool) -> SidecarStatus {
        let outcome = if wait_for_readiness {
            wait_for_health(&self.health)
        } else {
            probe_health_once(&self.health.url, self.health.timeout)
        };
        match outcome {
            HealthProbeOutcome::Ready => self.ready_status(),
            HealthProbeOutcome::NotReady(detail) => self.degraded_health_status(&detail),
        }
    }

    fn ready_status(&self) -> SidecarStatus {
        SidecarStatus {
            state: "ready".into(),
            label: "Sidecar ready".into(),
            detail: format!("chem-service /healthz is ready via {}", self.command_label),
            pid: Some(self.pid),
            started_at: Some(self.started_at.clone()),
            log_tail: log_lines(&self.logs),
        }
    }

    fn degraded_health_status(&self, detail: &str) -> SidecarStatus {
        SidecarStatus {
            state: "degraded".into(),
            label: "Sidecar health check failed".into(),
            detail: format!(
                "chem-service process spawned via {} but /healthz is not ready: {detail}",
                self.command_label
            ),
            pid: Some(self.pid),
            started_at: Some(self.started_at.clone()),
            log_tail: log_lines(&self.logs),
        }
    }
}
