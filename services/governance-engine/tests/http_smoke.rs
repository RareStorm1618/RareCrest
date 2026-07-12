use axum::body::Body;
use axum::http::{Request, StatusCode};
use governance_engine::app::build_router;
use governance_engine::kill_switch_controller::KillSwitchController;
use governance_engine::types::{AgentRight, HardRuleCheckRequest};
use std::sync::{Arc, Mutex};
use tower::ServiceExt;

#[tokio::test]
async fn health_returns_ok() {
    let app = build_router(Arc::new(Mutex::new(KillSwitchController::default())));
    let response = app
        .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn hard_rule_check_allows_valid_request() {
    std::env::remove_var("INTERNAL_SERVICE_TOKEN");
    let app = build_router(Arc::new(Mutex::new(KillSwitchController::default())));
    let body = serde_json::to_string(&HardRuleCheckRequest {
        agent_id: "agent-1".into(),
        entity_id: uuid::Uuid::new_v4().to_string(),
        vertical: "rareangels".into(),
        requested_rights: vec![AgentRight::SensitiveData],
        touches_phi: false,
        touches_financial: false,
        encryption_layer_present: true,
        human_instruction_id: None,
    })
    .unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/rpc/hard-rule-check")
                .header("content-type", "application/json")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn hard_rule_check_rejects_missing_token_when_configured() {
    std::env::set_var("INTERNAL_SERVICE_TOKEN", "test-secret");
    let app = build_router(Arc::new(Mutex::new(KillSwitchController::default())));
    let body = serde_json::to_string(&HardRuleCheckRequest {
        agent_id: "agent-1".into(),
        entity_id: uuid::Uuid::new_v4().to_string(),
        vertical: "rareangels".into(),
        requested_rights: vec![AgentRight::SensitiveData],
        touches_phi: false,
        touches_financial: false,
        encryption_layer_present: true,
        human_instruction_id: None,
    })
    .unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/rpc/hard-rule-check")
                .header("content-type", "application/json")
                .body(Body::from(body))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    std::env::remove_var("INTERNAL_SERVICE_TOKEN");
}
