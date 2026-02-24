const BASE_URL = "http://localhost:8000/api/analysis";

async function handleResponse(response) {
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(data?.detail || data?.message || "Request failed");
    error.status = response.status;
    throw error;
  }
  return data;
}

// ==================== Session Management ====================

export async function createSession({ subject, title = null }) {
  const res = await fetch(`${BASE_URL}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject, title }),
  });
  return handleResponse(res);
}

export async function getSessions() {
  const res = await fetch(`${BASE_URL}/sessions`);
  return handleResponse(res);
}

export async function checkSessionStatus(sessionId) {
  const res = await fetch(`${BASE_URL}/${sessionId}/status`);
  return handleResponse(res);
}

// ==================== File Operations ====================

export async function uploadFiles(sessionId, files) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  
  const res = await fetch(`${BASE_URL}/${sessionId}/upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse(res);
}

// ==================== Analysis Operations ====================

export async function triggerAutoProcess(sessionId) {
  const res = await fetch(`${BASE_URL}/${sessionId}/auto-process`, {
    method: "POST",
  });
  return handleResponse(res);
}

// ==================== Results ====================

export async function getResults(sessionId) {
  const res = await fetch(`${BASE_URL}/${sessionId}/results`);
  return handleResponse(res);
}

export async function getSectionResults(sessionId) {
  const res = await fetch(`${BASE_URL}/${sessionId}/section-results`);
  return handleResponse(res);
}

export async function getHighlights(sessionId, fileAId, fileBId) {
  const res = await fetch(
    `${BASE_URL}/${sessionId}/highlights?file_a_id=${fileAId}&file_b_id=${fileBId}`
  );
  return handleResponse(res);
}

// ==================== Dashboard ====================

export async function getDashboardStats() {
  const res = await fetch(`${BASE_URL}/dashboard/stats`);
  return handleResponse(res);
}