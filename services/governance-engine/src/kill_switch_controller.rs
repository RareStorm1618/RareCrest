use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillSwitchArmRequest {
    pub entity_id: String,
    pub actor_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillSwitchTriggerRequest {
    pub entity_id: String,
    pub actor_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillSwitchVerdict {
    pub entity_id: String,
    pub actor_id: String,
    pub armed: bool,
    pub triggered: bool,
    pub state: String,
    pub reason: String,
    pub timestamp: String,
}

#[derive(Debug, Default)]
pub struct KillSwitchController {
    armed_entities: HashSet<String>,
}

impl KillSwitchController {
    pub fn arm(&mut self, req: &KillSwitchArmRequest) -> KillSwitchVerdict {
        self.armed_entities.insert(req.entity_id.clone());
        KillSwitchVerdict {
            entity_id: req.entity_id.clone(),
            actor_id: req.actor_id.clone(),
            armed: true,
            triggered: false,
            state: "armed".to_string(),
            reason: req.reason.clone(),
            timestamp: Utc::now().to_rfc3339(),
        }
    }

    pub fn trigger(&mut self, req: &KillSwitchTriggerRequest) -> KillSwitchVerdict {
        if !self.armed_entities.contains(&req.entity_id) {
            return KillSwitchVerdict {
                entity_id: req.entity_id.clone(),
                actor_id: req.actor_id.clone(),
                armed: false,
                triggered: false,
                state: "ignored_unarmed".to_string(),
                reason: "kill-switch not armed".to_string(),
                timestamp: Utc::now().to_rfc3339(),
            };
        }
        self.armed_entities.remove(&req.entity_id);
        KillSwitchVerdict {
            entity_id: req.entity_id.clone(),
            actor_id: req.actor_id.clone(),
            armed: false,
            triggered: true,
            state: "halted".to_string(),
            reason: req.reason.clone(),
            timestamp: Utc::now().to_rfc3339(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arm_marks_entity_as_armed() {
        let mut controller = KillSwitchController::default();
        let verdict = controller.arm(&KillSwitchArmRequest {
            entity_id: "entity-a".into(),
            actor_id: "director-1".into(),
            reason: "manual precaution".into(),
        });
        assert!(verdict.armed);
        assert_eq!(verdict.state, "armed");
    }

    #[test]
    fn trigger_requires_prior_arm() {
        let mut controller = KillSwitchController::default();
        let verdict = controller.trigger(&KillSwitchTriggerRequest {
            entity_id: "entity-a".into(),
            actor_id: "director-1".into(),
            reason: "halt now".into(),
        });
        assert!(!verdict.triggered);
        assert_eq!(verdict.state, "ignored_unarmed");
    }

    #[test]
    fn trigger_halts_when_prearmed() {
        let mut controller = KillSwitchController::default();
        controller.arm(&KillSwitchArmRequest {
            entity_id: "entity-a".into(),
            actor_id: "director-1".into(),
            reason: "watchlist".into(),
        });
        let verdict = controller.trigger(&KillSwitchTriggerRequest {
            entity_id: "entity-a".into(),
            actor_id: "director-1".into(),
            reason: "hard-rule breach".into(),
        });
        assert!(verdict.triggered);
        assert_eq!(verdict.state, "halted");
    }
}
