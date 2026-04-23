export const API_ORIGIN =
  process.env.REACT_APP_API_ORIGIN || "http://localhost:8000";

const BASE_URL = `${API_ORIGIN}/api/analysis`;

export function resolveApiUrl(path) {
  if (!path) {
    return null;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

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

export async function uploadFiles(sessionId, files) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));

  const res = await fetch(`${BASE_URL}/${sessionId}/upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse(res);
}

export async function triggerAutoProcess(sessionId) {
  const res = await fetch(`${BASE_URL}/${sessionId}/auto-process`, {
    method: "POST",
  });
  return handleResponse(res);
}

export async function getResults(sessionId) {
  const res = await fetch(`${BASE_URL}/${sessionId}/results`);
  return handleResponse(res);
}

export async function getSectionResults(sessionId) {
  const res = await fetch(`${BASE_URL}/${sessionId}/section-results`);
  return handleResponse(res);
}

export async function getDashboardStats() {
  const res = await fetch(`${BASE_URL}/dashboard/stats`);
  return handleResponse(res);
}

export async function deleteSession(sessionId) {
  const res = await fetch(`${BASE_URL}/${sessionId}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

export async function deleteMultipleSessions(sessionIds) {
  const res = await fetch(`${BASE_URL}/bulk-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_ids: sessionIds }),
  });
  return handleResponse(res);
}
