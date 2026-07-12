use serde::{Deserialize, Serialize};

/// WO-13: DeploymentGateService — maturity floor and migration red-halt
pub struct DeploymentGateService;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentGateInput {
    pub maturity_score: u8,
    pub maturity_threshold: u8,
    pub migration_blocked: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentGateVerdict {
    pub permitted: bool,
    pub missing_controls: Vec<String>,
}

impl DeploymentGateService {
    pub fn check_maturity_floor(maturity_score: u8, threshold: u8) -> bool {
        maturity_score >= threshold
    }

    pub fn check_migration_red_halt(migration_blocked: bool) -> bool {
        !migration_blocked
    }

    pub fn evaluate(input: &DeploymentGateInput) -> DeploymentGateVerdict {
        let mut missing = Vec::new();
        if !Self::check_maturity_floor(input.maturity_score, input.maturity_threshold) {
            missing.push("maturity_floor".into());
        }
        if !Self::check_migration_red_halt(input.migration_blocked) {
            missing.push("migration_red_halt".into());
        }
        DeploymentGateVerdict {
            permitted: missing.is_empty(),
            missing_controls: missing,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permits_when_maturity_met_and_migration_clear() {
        let verdict = DeploymentGateService::evaluate(&DeploymentGateInput {
            maturity_score: 4,
            maturity_threshold: 3,
            migration_blocked: false,
        });
        assert!(verdict.permitted);
        assert!(verdict.missing_controls.is_empty());
    }

    #[test]
    fn blocks_low_maturity() {
        let verdict = DeploymentGateService::evaluate(&DeploymentGateInput {
            maturity_score: 1,
            maturity_threshold: 3,
            migration_blocked: false,
        });
        assert!(!verdict.permitted);
        assert!(verdict.missing_controls.contains(&"maturity_floor".to_string()));
    }

    #[test]
    fn blocks_migration_red_halt() {
        let verdict = DeploymentGateService::evaluate(&DeploymentGateInput {
            maturity_score: 5,
            maturity_threshold: 3,
            migration_blocked: true,
        });
        assert!(!verdict.permitted);
        assert!(verdict.missing_controls.contains(&"migration_red_halt".to_string()));
    }
}
