//! Somewhere for the Kokoro model to live once it has been downloaded.
//!
//! The webview's own storage is a poor home for 330 MB: the dev server and the
//! installed app are different origins, so each would download separately, and
//! the browser is free to evict it. Instead the files are written to the app's
//! data folder, keyed by the Hugging Face URL they came from.
//!
//! Only URLs inside the Kokoro repo are accepted, and each becomes a plain
//! relative path, so nothing the webview sends can name a file outside the
//! cache.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager};

const REPO_PREFIX: &str = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/";
const KEY_HEADER: &str = "x-cache-key";

/// The path under the cache root that a URL is stored at, or `None` if the URL
/// is not one this cache will hold.
pub fn key_to_path(key: &str) -> Option<PathBuf> {
  let rest = key.strip_prefix(REPO_PREFIX)?;
  if rest.is_empty() {
    return None;
  }

  let allowed = |c: char| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/');
  if !rest.chars().all(allowed) {
    return None;
  }

  let mut path = PathBuf::new();
  for segment in rest.split('/') {
    if segment.is_empty() || segment == "." || segment == ".." {
      return None;
    }
    path.push(segment);
  }
  Some(path)
}

fn root(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
  Ok(dir.join("model-cache"))
}

fn resolve(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
  let relative = key_to_path(key).ok_or_else(|| format!("not a cacheable key: {key}"))?;
  Ok(root(app)?.join(relative))
}

/// Write via a sibling `.part` file and a rename, so a crash mid-write never
/// leaves a truncated file that a later read would take for the real thing.
pub fn write_atomically(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent)?;
  }
  let mut partial = path.as_os_str().to_owned();
  partial.push(".part");
  let partial = PathBuf::from(partial);

  let mut file = fs::File::create(&partial)?;
  file.write_all(bytes)?;
  file.sync_all()?;
  drop(file);
  fs::rename(&partial, path)
}

async fn blocking<T: Send + 'static>(
  work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
  tauri::async_runtime::spawn_blocking(work)
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn model_cache_read(app: AppHandle, key: String) -> Result<Response, String> {
  let path = resolve(&app, &key)?;
  let bytes = blocking(move || fs::read(&path).map_err(|e| e.to_string())).await?;
  Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn model_cache_write(app: AppHandle, request: Request<'_>) -> Result<(), String> {
  let key = request
    .headers()
    .get(KEY_HEADER)
    .and_then(|value| value.to_str().ok())
    .ok_or("missing cache key")?
    .to_owned();
  let InvokeBody::Raw(bytes) = request.body() else {
    return Err("expected a raw body".into());
  };
  let bytes = bytes.clone();

  let path = resolve(&app, &key)?;
  blocking(move || write_atomically(&path, &bytes).map_err(|e| e.to_string())).await
}

#[tauri::command]
pub async fn model_cache_has(app: AppHandle, keys: Vec<String>) -> Result<Vec<bool>, String> {
  let root = root(&app)?;
  blocking(move || {
    Ok(
      keys
        .iter()
        .map(|key| key_to_path(key).is_some_and(|relative| root.join(relative).is_file()))
        .collect(),
    )
  })
  .await
}

#[cfg(test)]
mod tests {
  use super::*;

  fn key(rest: &str) -> String {
    format!("{REPO_PREFIX}{rest}")
  }

  #[test]
  fn accepts_the_files_kokoro_needs() {
    for rest in [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "onnx/model.onnx",
      "onnx/model_quantized.onnx",
      "voices/af_heart.bin",
    ] {
      let path = key_to_path(&key(rest)).expect(rest);
      assert_eq!(path, PathBuf::from_iter(rest.split('/')));
    }
  }

  #[test]
  fn rejects_anything_else() {
    for bad in [
      "https://huggingface.co/someone-else/model/resolve/main/config.json".to_owned(),
      "https://example.com/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/config.json".to_owned(),
      "/models/onnx-community/Kokoro-82M-v1.0-ONNX/config.json".to_owned(),
      key(""),
      key("../secrets"),
      key("onnx/../../x"),
      key("%2e%2e/x"),
      key("config.json?download=1"),
      key("config.json#x"),
      key("/etc/passwd"),
      key("onnx//model.onnx"),
      key("onnx\\model.onnx"),
    ] {
      assert!(key_to_path(&bad).is_none(), "{bad}");
    }
  }

  #[test]
  fn writes_replace_whole_files_and_leave_nothing_behind() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("onnx").join("model.onnx");

    write_atomically(&path, b"first").unwrap();
    write_atomically(&path, b"second").unwrap();

    assert_eq!(fs::read(&path).unwrap(), b"second");
    let names: Vec<_> = fs::read_dir(path.parent().unwrap())
      .unwrap()
      .map(|entry| entry.unwrap().file_name())
      .collect();
    assert_eq!(names, vec!["model.onnx"]);
  }
}
