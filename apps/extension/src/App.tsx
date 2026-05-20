import { useEffect, useState } from "react";
import { authSchema, useExtensionStore } from "./store";
import "./App.css";

type ApiResponse<T> = {
  ok: boolean;
  status: number;
  body: T;
  error?: string;
};

type BackgroundMessage = {
  type: string;
  payload?: unknown;
};

function sendToBackground<T = unknown>(message: BackgroundMessage) {
  return new Promise<T>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as T);
    });
  });
}

async function apiRequest<T = unknown>(path: string, method = "GET", body?: unknown) {
  const token = await new Promise<string | null>((resolve) => {
    chrome.storage.local.get(["miniAptyToken"], (result) => {
      resolve((result as { miniAptyToken?: string }).miniAptyToken ?? null);
    });
  });

  const request = {
    url: `http://localhost:3000${path}`,
    options: {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    }
  };

  const response = await sendToBackground<ApiResponse<T>>({
    type: "apiRequest",
    payload: request
  });

  if (!response || !response.ok) {
    const backendMessage =
      (response.body as { error?: string })?.error;

    throw new Error(
      backendMessage ||
      response?.error ||
      `Request failed: ${response?.status}`
    );
  }

  return response.body;
}

function App() {
  const [form, setForm] = useState({ email: "", password: "" });
  const {
    token,
    email,
    message,
    messageType,
    isLoading,
    setToken,
    setEmail,
    setMessage,
    setLoading
  } = useExtensionStore();

  const showMessage = (text: string, type: "info" | "success" | "error" = "info") => {
    setMessage(text, type);
  };

  const isEmailValid = form.email.includes("@");
  const isPasswordValid = form.password.length >= 8;
  const isFormValid = isEmailValid && isPasswordValid;

  useEffect(() => {
    chrome.storage.local.get(["miniAptyToken", "miniAptyEmail"], (result) => {
      const storedToken = (result as { miniAptyToken?: string }).miniAptyToken;
      if (storedToken) {
        setToken(storedToken);
        setMessage("Authenticated token loaded.");
      }
    });
  }, [setToken, setMessage]);

  async function authenticate(type: "login" | "signup") {
    const validation = authSchema.safeParse(form);
    if (!validation.success) {
      showMessage(validation.error.issues.map((issue) => issue.message).join(" "), "error");
      return;
    }

    try {
      setLoading(true);
      const data = await apiRequest<{ token: string; user: { email: string } }>(
        `/auth/${type}`,
        "POST",
        validation.data
      );

      setToken(data.token);
      setEmail(data.user.email);
      chrome.storage.local.set({ miniAptyToken: data.token, miniAptyEmail: data.user.email });
      if (type === "signup") {
        showMessage(
          "Signup successful. Please login with your credentials.",
          "success"
        );

        setForm({
          email: validation.data.email,
          password: ""
        });

        return;
      }

      showMessage("Login successful.", "success");

      chrome.tabs.query(
        {
          active: true,
          currentWindow: true
        },
        (tabs) => {
          const activeTab = tabs[0];

          if (!activeTab?.id) return;

          chrome.tabs.sendMessage(
            activeTab.id,
            {
              type: "miniApty.openPanel"
            }
          );

          window.close();
        }
      );
      showMessage(`${type === "login" ? "Login" : "Signup"} successful.`, "success");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    setToken(null);
    setEmail(null);
    chrome.storage.local.remove(["miniAptyToken"]);
    showMessage("Logged out.", "info");
  }

  return (
    <div className="app-shell">
      <header>
        <h1>Mini Apty</h1>
        <p>React popup for recorder control, playback, and auth.</p>

        {message && (
          <div
            style={{
              padding: "10px",
              marginTop: "12px",
              borderRadius: "8px",
              fontWeight: 600,
              background:
                messageType === "error"
                  ? "#fee2e2"
                  : "#dcfce7",
              color:
                messageType === "error"
                  ? "#b91c1c"
                  : "#166534",
              border:
                messageType === "error"
                  ? "1px solid #ef4444"
                  : "1px solid #22c55e"
            }}
          >
            {message}
          </div>
        )}
      </header>

      <section className="box auth-box">
        <div className="status-row">
          <span className="status-label">Authenticated:</span>
          <strong>{token ? email ?? "Yes" : "No"}</strong>
        </div>

        <div className="form-row">
          <label>
            Email
            <input
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              type="email"
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              type="password"
              placeholder="Minimum 8 characters"
            />
          </label>
        </div>

        <div className="button-row">
          <button
            type="button"
            onClick={() => authenticate("login")}
            disabled={isLoading || !isFormValid}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => authenticate("signup")}
            disabled={isLoading || !isFormValid}
          >
            Signup
          </button>
          <button type="button" onClick={logout} disabled={!token || isLoading}>
            Logout
          </button>
        </div>
      </section>

    </div>
  );
}

export default App;
