use crate::deployment_gate::{DeploymentGateInput, DeploymentGateService, DeploymentGateVerdict};
use crate::kill_switch_controller::{
    KillSwitchArmRequest, KillSwitchController, KillSwitchTriggerRequest, KillSwitchVerdict,
};
use crate::runtime_enforcement::{ActivationRequest, RuntimeEnforcementService};
use crate::types::{HardRuleCheckRequest, HardRuleVerdict, HealthResponse};
use axum::{
    extract::{Json, State},
    routing::{get, post},
    Router,
};
use chrono::Utc;
use std::sync::{Arc, Mutex};

pub fn build_router(kill_switch: Arc<Mutex<KillSwitchController>>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/rpc/hard-rule-check", post(hard_rule_check))
        .route("/rpc/runtime/activate", post(runtime_activate))
        .route("/rpc/deployment-gate", post(deployment_gate))
        .route("/rpc/kill-switch/arm", post(kill_switch_arm))
        .route("/rpc/kill-switch/trigger", post(kill_switch_trigger))
        .with_state(kill_switch)
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".into(),
        service: "governance-engine".into(),
        timestamp: Utc::now().to_rfc3339(),
    })
}

async fn hard_rule_check(Json(request): Json<HardRuleCheckRequest>) -> Json<HardRuleVerdict> {
    Json(RuntimeEnforcementService::enforce_action(&request))
}

async fn runtime_activate(
    Json(request): Json<ActivationRequest>,
) -> Json<crate::runtime_enforcement::ActivationVerdict> {
    Json(RuntimeEnforcementService::evaluate_activation(&request))
}

async fn deployment_gate(Json(request): Json<DeploymentGateInput>) -> Json<DeploymentGateVerdict> {
    Json(DeploymentGateService::evaluate(&request))
}

async fn kill_switch_arm(
    State(controller): State<Arc<Mutex<KillSwitchController>>>,
    Json(request): Json<KillSwitchArmRequest>,
) -> Json<KillSwitchVerdict> {
    let mut guard = controller.lock().expect("kill switch mutex poisoned");
    Json(guard.arm(&request))
}

async fn kill_switch_trigger(
    State(controller): State<Arc<Mutex<KillSwitchController>>>,
    Json(request): Json<KillSwitchTriggerRequest>,
) -> Json<KillSwitchVerdict> {
    let mut guard = controller.lock().expect("kill switch mutex poisoned");
    Json(guard.trigger(&request))
}
