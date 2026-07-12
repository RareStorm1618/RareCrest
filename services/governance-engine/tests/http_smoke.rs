use axum::body::Body;
use axum::http::{Request, StatusCode};
use governance_engine::app::build_router;
use governance_engine::kill_switch_controller::KillSwitchController;
use governance_engine::types::{AgentRight, HardRuleCheckRequest};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use tower::ServiceExt;

/// Tests below mutate process-wide env vars (INTERNAL_SERVICE_TOKEN, AUTH_TRUST_MODE).
/// Serialize them within this binary so parallel test threads cannot race each other.
fn env_lock() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner())
}

fn clear_internal_rpc_env() {
    std::env::remove_var("INTERNAL_SERVICE_TOKEN");
    std::env::remove_var("INTERNAL_SERVICE_TOKEN_FILE");
    std::env::remove_var("AUTH_TRUST_MODE");
    std::env::remove_var("REQUIRE_INTERNAL_RPC_AUTH");
}

#[tokio::test]
async fn health_returns_ok() {
    let _guard = env_lock();
    let app = build_router(Arc::new(Mutex::new(KillSwitchController::default())));
    let response = app
        .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn hard_rule_check_allows_valid_request() {
    let _guard = env_lock();
    clear_internal_rpc_env();
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
    clear_internal_rpc_env();
}

#[tokio::test]
async fn hard_rule_check_rejects_missing_token_when_configured() {
    let _guard = env_lock();
    clear_internal_rpc_env();
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
    clear_internal_rpc_env();
}

#[tokio::test]
async fn hard_rule_check_fails_closed_when_strict_and_no_token_configured() {
    let _guard = env_lock();
    clear_internal_rpc_env();
    std::env::set_var("AUTH_TRUST_MODE", "strict");
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
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    clear_internal_rpc_env();
}

#[tokio::test]
async fn health_stays_open_when_strict_and_no_token_configured() {
    let _guard = env_lock();
    clear_internal_rpc_env();
    std::env::set_var("AUTH_TRUST_MODE", "strict");
    let app = build_router(Arc::new(Mutex::new(KillSwitchController::default())));
    let response = app
        .oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    clear_internal_rpc_env();
}
