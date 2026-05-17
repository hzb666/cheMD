use crate::chem_preview_render::{
    read_service_error, render_endpoint, render_request_body, ChemPreviewRenderInput,
};
use serde_json::json;

#[test]
fn render_request_body_builds_molecule_payload_for_chem_service() {
    let input = ChemPreviewRenderInput {
        render_type: "molecule".into(),
        smiles: Some("CCO".into()),
        molfile: None,
        reactants: None,
        products: None,
        conditions: None,
        render_options: Some(json!({ "theme": "dark" })),
    };

    let body = render_request_body(&input);

    assert_eq!(
        body,
        json!({
            "smiles": "CCO",
            "molfile": null,
            "renderOptions": { "theme": "dark" }
        })
    );
}

#[test]
fn render_request_body_builds_reaction_payload_with_empty_lists() {
    let input = ChemPreviewRenderInput {
        render_type: "reaction".into(),
        smiles: None,
        molfile: None,
        reactants: None,
        products: Some(vec!["CCO".into()]),
        conditions: None,
        render_options: None,
    };

    let body = render_request_body(&input);

    assert_eq!(
        body,
        json!({
            "reactants": [],
            "products": ["CCO"],
            "conditions": [],
            "renderOptions": null
        })
    );
}

#[test]
fn render_endpoint_rejects_unknown_type_with_command_error_code() {
    let input = ChemPreviewRenderInput {
        render_type: "spectra".into(),
        smiles: None,
        molfile: None,
        reactants: None,
        products: None,
        conditions: None,
        render_options: None,
    };

    let error = render_endpoint(&input)
        .expect_err("unknown preview render type should be rejected")
        .into_error();

    assert_eq!(error.code, "chem_preview_render_failed");
    assert_eq!(error.message, "chem-service render endpoint failed");
    assert_eq!(
        error.detail.as_deref(),
        Some("unsupported preview render type: spectra")
    );
}

#[test]
fn read_service_error_falls_back_when_message_is_blank() {
    let detail = read_service_error(json!({ "message": "   " }), 503);

    assert_eq!(detail, "chem-service render failed (503)");
}
