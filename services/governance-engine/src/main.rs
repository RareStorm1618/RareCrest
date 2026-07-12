use governance_engine::app::build_router;
use governance_engine::kill_switch_controller::KillSwitchController;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .init();

    let kill_switch = Arc::new(Mutex::new(KillSwitchController::default()));
    let app = build_router(kill_switch);

    let port: u16 = std::env::var("GOVERNANCE_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);

    // Fail-closed private bind: default to loopback-only. Set GOVERNANCE_HOST to bind
    // elsewhere (e.g. behind a private network/VPN), matching the API fortress posture.
    let host: std::net::IpAddr = std::env::var("GOVERNANCE_HOST")
        .ok()
        .and_then(|h| h.parse().ok())
        .unwrap_or(std::net::IpAddr::V4(std::net::Ipv4Addr::new(127, 0, 0, 1)));

    let addr = SocketAddr::from((host, port));
    tracing::info!("Governance Engine listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
