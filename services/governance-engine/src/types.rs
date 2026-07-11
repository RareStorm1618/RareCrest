use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AgentRight {
    SensitiveData,
    CodeExecution,
    ExternalComms,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardRuleCheckRequest {
    pub agent_id: String,
    pub entity_id: String,
    pub vertical: String,
    pub requested_rights: Vec<AgentRight>,
    pub touches_phi: bool,
    pub touches_financial: bool,
    pub encryption_layer_present: bool,
    pub human_instruction_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldError {
    pub field: String,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardRuleVerdict {
    pub allowed: bool,
    pub reasons: Vec<FieldError>,
    pub trace_id: String,
    pub evaluated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub timestamp: String,
}
