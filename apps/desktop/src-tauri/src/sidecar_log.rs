use std::{
    collections::VecDeque,
    io::{BufRead, BufReader, Read},
    sync::{Arc, Mutex},
    thread,
};

const LOG_LINE_MAX_BYTES: usize = 1_000;
pub(crate) const DEFAULT_LOG_TAIL_MAX_LINES: usize = 80;

pub(crate) type SharedLogTail = Arc<Mutex<LogTail>>;

#[derive(Debug)]
pub(crate) struct LogTail {
    max_lines: usize,
    lines: VecDeque<String>,
}

impl LogTail {
    pub(crate) fn default_shared() -> SharedLogTail {
        Arc::new(Mutex::new(Self::new(DEFAULT_LOG_TAIL_MAX_LINES)))
    }

    pub(crate) fn new(max_lines: usize) -> Self {
        Self {
            max_lines,
            lines: VecDeque::new(),
        }
    }

    pub(crate) fn push(&mut self, stream: &str, line: &str) {
        let trimmed = truncate_line(line.trim_end_matches(['\r', '\n']));
        self.lines.push_back(format!("[{stream}] {trimmed}"));
        while self.lines.len() > self.max_lines {
            self.lines.pop_front();
        }
    }

    pub(crate) fn lines(&self) -> Vec<String> {
        self.lines.iter().cloned().collect()
    }
}

pub(crate) fn spawn_log_reader<R>(stream: &'static str, reader: R, tail: SharedLogTail)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let buffered = BufReader::new(reader);
        for line in buffered.lines() {
            let Ok(line) = line else {
                break;
            };
            if let Ok(mut tail) = tail.lock() {
                tail.push(stream, &line);
            }
        }
    });
}

fn truncate_line(line: &str) -> String {
    if line.len() <= LOG_LINE_MAX_BYTES {
        return line.into();
    }
    let mut end = LOG_LINE_MAX_BYTES;
    while !line.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}...", &line[..end])
}
