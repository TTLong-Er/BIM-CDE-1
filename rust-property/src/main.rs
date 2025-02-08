use actix_cors::Cors;
use actix_web::{http, web, App, HttpResponse, HttpServer, Responder};
use mongodb::{bson::doc, Client, Collection, Database};
use serde::{Deserialize, Serialize};
use std::env;
use tracing::info;
use tracing_subscriber::EnvFilter;

#[derive(Debug, Serialize, Deserialize)]
struct Properties {
    #[serde(rename = "modelId")]
    model_id: String,

    #[serde(rename = "name")]
    name: String,

    #[serde(rename = "data")]
    data: serde_json::Value,
}

struct AppState {
    db: Database,
}

/// API insert properties
async fn insert_properties(
    state: web::Data<AppState>,
    json: web::Json<Vec<Properties>>,
) -> impl Responder {
    let collection: Collection<Properties> = state.db.collection("properties");

    match collection.insert_many(json.into_inner()).await {
        Ok(_) => HttpResponse::Ok().json("Success"),
        Err(err) => HttpResponse::InternalServerError().body(format!("Error: {}", err)),
    }
}
async fn get_properties(
    state: web::Data<AppState>,
    path: web::Path<(String, String)>,
) -> impl Responder {
    let (model_id, name) = path.into_inner();
    let filter = doc! { "modelId": model_id, "name": name };
    let collection: Collection<Properties> = state.db.collection("properties");

    match collection.find_one(filter.clone()).await {
        Ok(Some(doc)) => HttpResponse::Ok().json(doc.data),
        Ok(None) => HttpResponse::NotFound().body("Not Found"),
        Err(err) => HttpResponse::InternalServerError().body(format!("Error: {}", err)),
    }
}

async fn init_db() -> Result<Database, mongodb::error::Error> {
    let mongo_uri = format!(
        "mongodb://{}:{}/?directConnection=true",
        env::var("MONGO_HOST").unwrap_or("localhost".to_string()),
        env::var("MONGO_PORT").unwrap_or("27017".to_string())
    );

    match Client::with_uri_str(&mongo_uri).await {
        Ok(client) => {
            let db = client.database("bimtiles");

            match db.run_command(doc! { "ping": 1 }).await {
                Ok(_) => {
                    info!("✅ Connected to MongoDB at {}", mongo_uri);
                    Ok(db)
                }
                Err(err) => {
                    eprintln!("❌ MongoDB is not responding: {}", err);
                    Err(err)
                }
            }
        }
        Err(err) => {
            eprintln!("❌ Failed to connect to MongoDB: {}", err);
            Err(err)
        }
    }
}
async fn health_check() -> impl Responder {
    HttpResponse::Ok().json("API is running 🚀")
}
#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let app_url = format!(
        "{}:{}",
        env::var("APP_HOST").unwrap_or("localhost".to_string()),
        env::var("APP_PORT").unwrap_or("8081".to_string())
    );

    let db = match init_db().await {
        Ok(db) => db,
        Err(_) => {
            eprintln!("❌ Server stopped because MongoDB connection failed.");
            return Ok(());
        }
    };
    let state = web::Data::new(AppState { db });

    info!("🚀 Server running on {:?}", app_url);

    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .app_data(web::JsonConfig::default().limit(50_000_000))
            .wrap(
                Cors::default()
                    .allow_any_origin()
                    .allowed_methods(vec!["GET", "POST", "PUT", "DELETE"])
                    .allowed_headers(vec![
                        http::header::CONTENT_TYPE,
                        http::header::AUTHORIZATION,
                    ])
                    .max_age(3600),
            )
            .route("/api/v1/models", web::get().to(health_check))
            .route("/api/v1/models", web::post().to(insert_properties))
            .route(
                "/api/v1/models/{model_id}/properties/{name}",
                web::get().to(get_properties),
            )
    })
    .bind(app_url)?
    .run()
    .await
}
