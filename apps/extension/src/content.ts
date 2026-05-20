console.log("Mini Apty content script loaded");

let isRecording = false;
let recorderPanel: HTMLDivElement | null = null;

let currentHighlighted: HTMLElement | null = null;
interface CapturedStep {
  id: number;

  title: string;

  description: string;

  selector: {
    tagName: string;
    id: string;
    className: string;
    text?: string;
    ariaLabel?: string | null;
    placeholder?: string | null;
    name?: string | null;
    type?: string | null;
    dataTestId?: string | null;
    cssPath?: string;
    attributes: Record<string, string>;
  };
}

const capturedSteps: CapturedStep[] = [];
const BACKEND_BASE_URL = "http://localhost:3000";

let currentPlayback: {
  walkthroughId: string;
  currentStep: number;
  steps: CapturedStep[];
} | null = null;

let editingStepId: number | null = null;
let autoAdvance = false;
let autoAdvanceDelay = 2000; // milliseconds
let playbackTimer: number | null = null;
let stepFailureTimer: number | null = null;

interface ApiRequestPayload {
  url: string;
  options: RequestInit;
}

function sendToBackground<T = unknown>(message: unknown) {
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

async function getToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["miniAptyToken"], (result) => {
      const token = (result as { miniAptyToken?: string }).miniAptyToken;
      resolve(token ?? null);
    });
  });
}

async function apiRequest<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  const token = await getToken();

  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json"
    }
  };

  if (token) {
    options.headers = {
      ...(options.headers as Record<string, string>),
      Authorization: `Bearer ${token}`
    };
  }

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const request: ApiRequestPayload = {
    url: `${BACKEND_BASE_URL}${path}`,
    options
  };

  const response = await sendToBackground<{
    ok: boolean;
    status?: number;
    body?: T;
    error?: string;
  }>({
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

  return response.body as T;
}

function showMessage(
  message: string,
  type: "info" | "error" = "info"
) {
  const container = document.getElementById(
    "mini-apty-message"
  );

  if (!container) return;

  container.textContent = message;

  container.style.padding = "10px";
  container.style.marginBottom = "12px";
  container.style.borderRadius = "6px";
  container.style.fontWeight = "600";

  if (type === "error") {
    container.style.background = "#fee2e2";
    container.style.color = "#b91c1c";
    container.style.border = "1px solid #ef4444";
  } else {
    container.style.background = "#dcfce7";
    container.style.color = "#166534";
    container.style.border = "1px solid #22c55e";
  }

  setTimeout(() => {
    container.textContent = "";
    container.style.background = "transparent";
    container.style.border = "none";
  }, 4000);
}

function clearMessage() {
  const container = document.getElementById("mini-apty-message");
  if (container) {
    container.textContent = "";
  }
}

function handleError(err: unknown, context?: string) {
  try {
    let message = "Unexpected error";

    if (err && typeof err === "object") {
      // Narrow to an object that may have a message property
      const maybeErr = err as { message?: unknown };
      if (typeof maybeErr.message === "string" && maybeErr.message.length) {
        message = maybeErr.message;
      } else {
        message = String(err);
      }
    } else {
      message = String(err);
    }

    console.error("[MiniApty] Error", context || "", err);
    // stop playback on any runtime error during playback
    if (currentPlayback) {
      resetPlayback();
    }
    showMessage(message || "Unexpected error", "error");
    // Auto-clear non-fatal messages after a bit
    setTimeout(() => clearMessage(), 8000);
  } catch (e) {
    console.error("[MiniApty] Error handling failed", e);
  }
}

function createPanel() {
  const panel = document.createElement("div");
  panel.style.position = "fixed";

  panel.id = "mini-apty-panel";

  panel.style.position = "fixed";
  panel.style.top = "20px";
  panel.style.right = "20px";
  panel.style.width = "320px";
  panel.style.maxHeight = "480px";
  panel.style.overflowY = "auto";
  panel.style.background = "white";
  panel.style.border = "1px solid #ccc";
  panel.style.borderRadius = "8px";
  panel.style.padding = "12px";
  panel.style.zIndex = "999999";
  panel.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
  panel.style.color = "#111";
  panel.style.opacity = "1";
  panel.style.fontFamily = "Arial, sans-serif";
  panel.style.display = "none";
  recorderPanel = panel;
  const style = document.createElement("style");

  style.textContent = `
  #mini-apty-save,
  #mini-apty-play,
  #mini-apty-record,
  #mini-apty-login,
  #mini-apty-signup {
    width: 100%;
    padding: 10px;
    margin-bottom: 12px;
    background: black;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
  }

  #mini-apty-play {
    background: #2563eb;
  }

  #mini-apty-record {
    background: #10b981;
  }

  #mini-apty-auth-fields input {
    width: 100%;
    margin-bottom: 8px;
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-sizing: border-box;
  }
  #mini-apty-record-status {
    font-size: 12px;
    color: #334155;
    margin-bottom: 12px;
  }
`;

  document.head.appendChild(style);

  panel.innerHTML = `
  <div id="mini-apty-close"
  style="
    position:absolute;
    top:10px;
    right:12px;
    cursor:pointer;
    font-size:20px;
    font-weight:bold;
  ">
  ×
</div>
  <h3>Mini Apty Recorder</h3>
  <div
  id="mini-apty-message"
  style="font-size:13px;margin-bottom:12px;"
></div>
  <button id="mini-apty-record" type="button">
    Start Recording
  </button>
  <div id="mini-apty-record-status">Recording is stopped.</div>
  <button id="mini-apty-play" type="button">
    Play Walkthrough
  </button>
  <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
    <label style="font-size:13px;display:flex;align-items:center;gap:6px;">
      <input id="mini-apty-auto" type="checkbox" /> Auto-advance
    </label>
    <input id="mini-apty-delay" type="number" min="250" step="250" value="2000" style="width:80px;padding:6px;border:1px solid #ccc;border-radius:6px;" />
    <div style="font-size:12px;color:#6b7280;">ms</div>
  </div>
  <div id="mini-apty-steps"></div>
  <div style="margin-top:8px;font-size:12px;color:#6b7280;">Tip: use Arrow keys for playback and Esc to cancel.</div>
`;

  document.body.appendChild(panel);

  const recordButton = panel.querySelector("#mini-apty-record") as HTMLButtonElement | null;
  const recordStatus = panel.querySelector("#mini-apty-record-status") as HTMLDivElement | null;

  function updateRecordControls() {
    if (recordButton) {
      recordButton.textContent = isRecording ? "Stop Recording" : "Start Recording";
    }
    if (recordStatus) {
      recordStatus.textContent = isRecording ? "Recording active — click an element to capture a step." : "Recording is stopped.";
    }
  }

  recordButton?.addEventListener("click", async () => {
  isRecording = !isRecording;

  updateRecordControls();

  if (isRecording) {
    showMessage(
      "Recording started",
      "info"
    );
  } else {
    showMessage(
      "Recording stopped. Saving walkthrough...",
      "info"
    );

    await saveWalkthrough();
  }
});

  updateRecordControls();
}

function showRecorderPanel() {
  const existingBalloon =
    document.getElementById("mini-apty-balloon");

  if (existingBalloon) {
    existingBalloon.remove();
  }

  const panel =
    recorderPanel ??
    document.getElementById("mini-apty-panel") as HTMLDivElement | null;

  if (panel) {
    panel.style.display = "block";
    panel.style.zIndex = "999999";
    recorderPanel = panel;
    isRecording = true;

const recordButton =
  document.getElementById(
    "mini-apty-record"
  ) as HTMLButtonElement | null;

const recordStatus =
  document.getElementById(
    "mini-apty-record-status"
  ) as HTMLDivElement | null;

if (recordButton) {
  recordButton.textContent =
    "Stop Recording";
}

if (recordStatus) {
  recordStatus.textContent =
    "Recording active — click elements to capture steps.";
}

showMessage(
  "Recording started automatically",
  "info"
);
    return;
  }

  createPanel();
  if (recorderPanel) {
    recorderPanel.style.display = "block";
  }
}

function setAutoAdvanceState(value: boolean) {
  autoAdvance = value;
}

function setDelayState(value: number) {
  autoAdvanceDelay = value >= 250 ? value : autoAdvanceDelay;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return false;
  }

  const { type, payload } = message as { type: string; payload?: unknown };

  try {
    switch (type) {
      case "miniApty.openPanel":
        showRecorderPanel();
        sendResponse({ ok: true });
        return true;
      case "miniApty.saveWalkthrough":
        saveWalkthrough()
          .then(() => sendResponse({ ok: true }))
          .catch((error) => sendResponse({ ok: false, error: String(error) }));
        return true;
      case "miniApty.playWalkthrough":
        playWalkthrough()
          .then(() => sendResponse({ ok: true }))
          .catch((error) => sendResponse({ ok: false, error: String(error) }));
        return true;
      case "miniApty.setAutoAdvance":
        if (typeof payload === "boolean") {
          setAutoAdvanceState(payload);
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: "Invalid auto-advance payload" });
        }
        return true;
      case "miniApty.setDelay":
        if (typeof payload === "number") {
          setDelayState(payload);
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: "Invalid delay payload" });
        }
        return true;
      default:
        return false;
    }
  } catch (error) {
    sendResponse({ ok: false, error: String(error) });
    return true;
  }
});

function updatePanel() {
  const stepsContainer =
    document.getElementById("mini-apty-steps");

  if (!stepsContainer) return;

  stepsContainer.innerHTML = capturedSteps
    .map((step, index) => {
      const isEditing = editingStepId === step.id;
      return `
        <div data-step-id="${step.id}"
          style="
            margin-bottom:12px;
            padding:12px;
            border:1px solid #ddd;
            border-radius:8px;
            background:#ffffff;
            color:#111111;
            opacity:1;
            font-family:Arial,sans-serif;
          "
        >
          <div
            style="
              font-weight:bold;
              font-size:18px;
              margin-bottom:8px;
              color:#222222;
              opacity:1;
            "
          >
            Step ${index + 1}
          </div>
          ${isEditing ? `
            <div style="display:flex;flex-direction:column;gap:8px;">
              <input id="step-title-${step.id}" value="${escapeHtml(step.title)}" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;" />
              <textarea id="step-description-${step.id}" rows="3" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;">${escapeHtml(step.description)}</textarea>
              <input id="step-csspath-${step.id}" value="${escapeHtml(step.selector.cssPath || "")}" placeholder="CSS path" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;" />
              <input id="step-text-${step.id}" value="${escapeHtml(step.selector.text || "")}" placeholder="Text content" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;" />
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button data-action="save" data-step-id="${step.id}" type="button" style="flex:1 1 120px;padding:8px 12px;border:none;border-radius:8px;background:#2563eb;color:white;cursor:pointer;">Save</button>
                <button data-action="cancel-edit" data-step-id="${step.id}" type="button" style="flex:1 1 120px;padding:8px 12px;border:none;border-radius:8px;background:#6b7280;color:white;cursor:pointer;">Cancel</button>
              </div>
            </div>
          ` : `
            <div style="font-size:16px;line-height:1.5;color:#333333;opacity:1;word-break:break-word;">
              ${escapeHtml(step.title)}
            </div>
            <div style="font-size:13px;color:#6b7280;margin-top:6px;white-space:pre-wrap;">${escapeHtml(step.description)}</div>
            <div style="font-size:12px;color:#4b5563;margin-top:8px;word-break:break-word;">${escapeHtml(step.selector.cssPath || step.selector.text || step.selector.tagName)}</div>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
              <button data-action="edit" data-step-id="${step.id}" type="button" style="flex:1 1 120px;padding:8px 12px;border:none;border-radius:8px;background:#2563eb;color:white;cursor:pointer;">Edit</button>
              <button data-action="delete" data-step-id="${step.id}" type="button" style="flex:1 1 120px;padding:8px 12px;border:none;border-radius:8px;background:#ef4444;color:white;cursor:pointer;">Delete</button>
            </div>
          `}
        </div>
      `;
    })
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function startEditingStep(stepId: number) {
  editingStepId = stepId;
  updatePanel();
}

function cancelEditStep() {
  editingStepId = null;
  updatePanel();
}

function saveStepEdit(stepId: number) {
  const titleInput = document.getElementById(`step-title-${stepId}`) as HTMLInputElement | null;
  const descriptionInput = document.getElementById(`step-description-${stepId}`) as HTMLTextAreaElement | null;
  const cssInput = document.getElementById(`step-csspath-${stepId}`) as HTMLInputElement | null;
  const textInput = document.getElementById(`step-text-${stepId}`) as HTMLInputElement | null;

  const stepIndex = capturedSteps.findIndex((s) => s.id === stepId);
  if (stepIndex === -1) return;

  const step = capturedSteps[stepIndex];
  if (titleInput) step.title = titleInput.value.trim() || step.title;
  if (descriptionInput) step.description = descriptionInput.value.trim() || step.description;
  if (cssInput) step.selector.cssPath = cssInput.value.trim();
  if (textInput) step.selector.text = textInput.value.trim();

  editingStepId = null;
  updatePanel();
  showMessage("Step updated", "info");
}

function deleteStep(stepId: number) {
  const stepIndex = capturedSteps.findIndex((s) => s.id === stepId);
  if (stepIndex === -1) return;

  capturedSteps.splice(stepIndex, 1);
  if (editingStepId === stepId) editingStepId = null;
  updatePanel();
  showMessage("Step removed", "info");
}

function highlightElement(element: HTMLElement) {
  if (currentHighlighted) {
    currentHighlighted.style.boxShadow = "";
  }

  currentHighlighted = element;
  element.style.boxShadow = "0 0 0 2px red";
}

function buildCssPath(element: HTMLElement) {
  const parts: string[] = [];
  let el: HTMLElement | null = element;

  while (el && el.tagName.toLowerCase() !== "html") {
    const current = el as HTMLElement;
    let part = current.tagName.toLowerCase();

    if (current.id) {
      part += `#${CSS.escape(current.id)}`;
      parts.unshift(part);
      break;
    }

    const classes = Array.from(current.classList as unknown as string[])
      .filter((cls): cls is string => Boolean(cls))
      .map((cls) => `.${CSS.escape(cls)}`)
      .join("");

    if (classes) {
      part += classes;
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children as HTMLCollectionOf<HTMLElement>).filter(
        (child) => child.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(part);
    el = current.parentElement;
  }

  return parts.join(" > ");
}

function getSelector(element: HTMLElement) {
  const attributes: Record<string, string> = {};

  if (element.attributes) {
    for (const attr of Array.from(element.attributes)) {
      if (attr.name === "style") continue;
      attributes[attr.name] = attr.value;
    }
  }

  return {
    tagName: element.tagName,
    id: element.id || "",
    className: element.className || "",
    text: element.innerText?.trim()?.slice(0, 120) || "",
    ariaLabel: element.getAttribute("aria-label"),
    placeholder: element.getAttribute("placeholder"),
    name: element.getAttribute("name"),
    type: element.getAttribute("type"),
    dataTestId: element.getAttribute("data-testid"),
    cssPath: buildCssPath(element),
    attributes
  };
}

function findElement(step: CapturedStep): HTMLElement | null {
  if (step.selector.cssPath) {
    const fromPath = document.querySelector(step.selector.cssPath);
    if (fromPath) {
      return fromPath as HTMLElement;
    }
  }

  if (step.selector.id) {
    const byId = document.getElementById(step.selector.id);
    if (byId) return byId;
  }

  const tag = step.selector.tagName.toLowerCase();
  const classes = step.selector.className
    .split(" ")
    .filter(Boolean)
    .map((cls) => `.${CSS.escape(cls)}`)
    .join("");

  const attributeSelectors: string[] = [];
  if (step.selector.dataTestId) {
    attributeSelectors.push(`[data-testid="${CSS.escape(step.selector.dataTestId)}"]`);
  }
  if (step.selector.name) {
    attributeSelectors.push(`[name="${CSS.escape(step.selector.name)}"]`);
  }
  if (step.selector.ariaLabel) {
    attributeSelectors.push(`[aria-label="${CSS.escape(step.selector.ariaLabel)}"]`);
  }
  if (step.selector.placeholder) {
    attributeSelectors.push(`[placeholder="${CSS.escape(step.selector.placeholder)}"]`);
  }
  if (step.selector.type) {
    attributeSelectors.push(`[type="${CSS.escape(step.selector.type)}"]`);
  }

  const query = `${tag}${classes}${attributeSelectors.join("")}`;
  if (query !== tag) {
    const found = document.querySelector(query) as HTMLElement | null;
    if (found) {
      return found;
    }
  }

  if (step.selector.text) {
    const candidates = Array.from(
      document.querySelectorAll(tag)
    ) as HTMLElement[];

    const exact = candidates.find((el) =>
      el.innerText?.trim() === step.selector.text
    );
    if (exact) return exact;

    const partial = candidates.find((el) =>
      el.innerText?.trim().includes(step.selector.text!)
    );
    if (partial) return partial;
  }

  return document.querySelector(query) as HTMLElement | null;
}

function getPlaybackProgressKey(walkthroughId: string) {
  return `miniApty-playback-${walkthroughId}`;
}

async function savePlaybackProgress(walkthroughId: string, stepIndex: number) {
  return new Promise<void>((resolve) => {
    chrome.storage.local.set({ [getPlaybackProgressKey(walkthroughId)]: stepIndex }, () => {
      resolve();
    });
  });
}

function createBalloon() {
  let balloon = document.getElementById("mini-apty-balloon") as HTMLDivElement | null;
  if (!balloon) {
    balloon = document.createElement("div");
    balloon.id = "mini-apty-balloon";
    balloon.style.position = "absolute";
    balloon.style.maxWidth = "320px";
    balloon.style.background = "white";
    balloon.style.border = "1px solid #ccc";
    balloon.style.borderRadius = "10px";
    balloon.style.boxShadow = "0 10px 25px rgba(0,0,0,0.16)";
    balloon.style.padding = "14px";
    balloon.style.zIndex = "1000000";
    balloon.style.fontFamily = "Arial, sans-serif";
    balloon.style.color = "#111";
    balloon.style.pointerEvents = "auto";

    balloon.innerHTML = `
      <div id="mini-apty-balloon-content"></div>
      <div style="margin-top:12px; display:flex; flex-wrap:wrap; gap:8px; justify-content:space-between;">
        <button id="mini-apty-prev" type="button" style="flex:1 1 120px;padding:8px 12px;border:none;border-radius:8px;background:#e5e7eb;color:#111;cursor:pointer;">Previous</button>
        <button id="mini-apty-next" type="button" style="flex:1 1 120px;padding:8px 12px;border:none;border-radius:8px;background:#2563eb;color:white;cursor:pointer;">Next</button>
        <button id="mini-apty-cancel" type="button" style="flex:1 1 120px;padding:8px 12px;border:none;border-radius:8px;background:#ef4444;color:white;cursor:pointer;">Cancel</button>
      </div>
    `;

    document.body.appendChild(balloon);

    balloon.querySelector("#mini-apty-prev")?.addEventListener("click", () => {
      if (!currentPlayback) return;

      if (playbackTimer) {
        clearTimeout(playbackTimer);
        playbackTimer = null;
      }

      const nextIndex = Math.max(
        0,
        currentPlayback.currentStep - 1
      );

      if (playbackTimer) {
  clearTimeout(playbackTimer);
  playbackTimer = null;
}

showPlaybackStep(
  currentPlayback,
  nextIndex
);
    });

    balloon.querySelector("#mini-apty-next")?.addEventListener("click", () => {
      if (!currentPlayback) return;
      const nextIndex = Math.min(currentPlayback.steps.length - 1, currentPlayback.currentStep + 1);
      showPlaybackStep(currentPlayback, nextIndex);
    });

    balloon.querySelector("#mini-apty-cancel")?.addEventListener("click", () => {
      resetPlayback();
    });
  }

  return balloon;
}

function removeBalloon() {
  const balloon = document.getElementById("mini-apty-balloon");
  if (balloon) {
    balloon.remove();
  }
}

function positionBalloon(element: HTMLElement, balloon: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const padding = 10;
  const top = window.scrollY + rect.top - balloon.offsetHeight - padding;
  const left = window.scrollX + rect.left;

  balloon.style.top = `${Math.max(10, top)}px`;
  balloon.style.left = `${Math.max(10, left)}px`;
}

async function showPlaybackStep(playback: { walkthroughId: string; currentStep: number; steps: CapturedStep[] }, stepIndex: number) {
  try {
    const step = playback.steps[stepIndex];
    playback.currentStep = stepIndex;
    currentPlayback = playback;

    await savePlaybackProgress(playback.walkthroughId, stepIndex);

    const element = findElement(step);
    const balloon = createBalloon();
    const content = balloon.querySelector("#mini-apty-balloon-content");

    if (content) {
      content.innerHTML = `
      <div style="font-weight:bold;font-size:16px;margin-bottom:8px;">${step.title}</div>
      <div style="font-size:14px;color:#374151;line-height:1.5;">${step.description}</div>
      <div style="margin-top:10px;font-size:12px;color:#6b7280;">Step ${stepIndex + 1} of ${playback.steps.length}</div>
    `;
    }

    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      await new Promise((resolve) => setTimeout(resolve, 250));
      highlightElement(element);
      positionBalloon(element, balloon);
      showMessage(`Playing step ${stepIndex + 1} of ${playback.steps.length}`, "info");
    } else {
      showMessage("Cannot find target element for this step. Use Skip or fix selector.", "error");
      balloon.style.top = `20px`;
      balloon.style.left = `20px`;
      if (stepFailureTimer) {
        clearTimeout(stepFailureTimer);
        stepFailureTimer = null;
      }
      if (stepIndex < playback.steps.length - 1) {
        stepFailureTimer = window.setTimeout(() => {
          if (!currentPlayback) return;
          showPlaybackStep(playback, stepIndex + 1);
        }, Math.max(autoAdvanceDelay, 3000));
      }
    }

    // clear any previous timer
    if (playbackTimer) {
      clearTimeout(playbackTimer);
      playbackTimer = null;
    }

    // auto-advance if enabled and not at the last step
    if (autoAdvance && element && stepIndex < playback.steps.length - 1) {
      playbackTimer = window.setTimeout(() => {
        // ensure playback wasn't cancelled
        if (!currentPlayback) return;
        showPlaybackStep(playback, stepIndex + 1);
      }, autoAdvanceDelay);
    }
  } catch (err) {
    handleError(err, "playback");
  }
}

function resetPlayback() {
  removeBalloon();
  if (currentHighlighted) {
    currentHighlighted.style.boxShadow = "";
    currentHighlighted = null;
  }
  currentPlayback = null;
  const playBtn = document.getElementById("mini-apty-play") as HTMLButtonElement | null;
  if (playBtn) playBtn.textContent = "Play Walkthrough";
  if (playbackTimer) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }
  if (stepFailureTimer) {
    clearTimeout(stepFailureTimer);
    stepFailureTimer = null;
  }
}

async function saveWalkthrough() {
  if (!capturedSteps.length) {
    showMessage("No captured steps to save.", "error");
    return;
  }

  try {
    const data = await apiRequest("/walkthroughs", "POST", {
      title: "Recorded Walkthrough",
      origin: window.location.origin,
      pathPattern: window.location.pathname,
      steps: capturedSteps
    });

    console.log("Saved walkthrough:", data);
    capturedSteps.length = 0;
    updatePanel();
    showMessage("Walkthrough saved successfully!", "info");
  } catch (error) {
    console.error(error);
    showMessage("Failed to save walkthrough", "error");
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let currentStepIndex = 0;
async function playWalkthrough() {
  currentStepIndex = 0;

  console.log("Playing walkthrough");
  try {
    resetPlayback();
    await savePlaybackProgress(
  "current",
  0
);

    const walkthroughs = await apiRequest<unknown[]>(
      `/walkthroughs?origin=${encodeURIComponent(
        window.location.origin
      )}&path=${encodeURIComponent(window.location.pathname)}`
    );

    if (!walkthroughs || !Array.isArray(walkthroughs) || !walkthroughs.length) {
      showMessage("No walkthroughs found for this page.", "error");
      return;
    }

    const walkthrough = walkthroughs[walkthroughs.length - 1] as {
      id: string;
      steps: CapturedStep[];
    };

    currentPlayback = {
      walkthroughId: walkthrough.id,
      currentStep: 0,
      steps: walkthrough.steps
    };

    showPlaybackStep(currentPlayback, 0);
  } catch (error) {
    console.error(error);

    const message =
      error instanceof Error
        ? error.message
        : "Failed to load walkthrough";

    showMessage(message, "error");
  }
}

createPanel();

const stepsContainer = document.getElementById("mini-apty-steps");
if (stepsContainer) {
  stepsContainer.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const action = target.getAttribute("data-action");
    const stepId = target.getAttribute("data-step-id");
    if (!action || !stepId) return;

    const id = Number(stepId);
    if (Number.isNaN(id)) return;

    if (action === "edit") {
      startEditingStep(id);
    }

    if (action === "cancel-edit") {
      cancelEditStep();
    }

    if (action === "save") {
      saveStepEdit(id);
    }

    if (action === "delete") {
      deleteStep(id);
    }
  });
}

const playButton = document.getElementById("mini-apty-play");

const autoCheckbox = document.getElementById("mini-apty-auto") as HTMLInputElement | null;
const delayInput = document.getElementById("mini-apty-delay") as HTMLInputElement | null;

playButton?.addEventListener("click", () => {
  if (currentPlayback) {
    resetPlayback();
  } else {
    const btn = document.getElementById("mini-apty-play") as HTMLButtonElement | null;
    if (btn) btn.textContent = "Stop Playback";
    playWalkthrough();
  }
});

const closeButton =
  document.getElementById(
    "mini-apty-close"
  );

closeButton?.addEventListener(
  "click",
  () => {
    recorderPanel?.remove();
    recorderPanel = null;
  }
);

if (autoCheckbox) {
  autoCheckbox.addEventListener("change", () => {
    autoAdvance = autoCheckbox.checked;
  });
}

if (delayInput) {
  delayInput.addEventListener("change", () => {
    const v = parseInt(delayInput.value, 10);
    if (!isNaN(v) && v >= 250) {
      autoAdvanceDelay = v;
    }
  });
}

window.addEventListener("error", (event) => {
  handleError(event.error || event.message || "Unknown error", "window.error");
});

window.addEventListener("unhandledrejection", (event) => {
  handleError(event.reason || "Unhandled promise rejection", "unhandledrejection");
});

document.addEventListener("keydown", (event) => {
  if (!currentPlayback) return;
  if (event.target instanceof HTMLElement) {
    const tagName = event.target.tagName;
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tagName)) {
      return;
    }
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    const nextIndex = Math.min(currentPlayback.steps.length - 1, currentPlayback.currentStep + 1);
    showPlaybackStep(currentPlayback, nextIndex);
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    const prevIndex = Math.max(0, currentPlayback.currentStep - 1);
    showPlaybackStep(currentPlayback, prevIndex);
  }

  if (event.key === "Escape") {
    event.preventDefault();
    resetPlayback();
  }
});

function getValidTarget(element: HTMLElement): HTMLElement | null {
  const invalidTags = ["BODY", "HTML"];

  if (invalidTags.includes(element.tagName)) {
    return null;
  }

  return element;
}

function isInsideExtensionUI(element: HTMLElement | null) {
  if (!element) return false;
  return Boolean(
    element.closest(
      "#mini-apty-panel, #mini-apty-balloon, #mini-apty-message"
    )
  );
}

document.addEventListener("mouseover", (event) => {
  if (!isRecording) return;

  const target = getValidTarget(event.target as HTMLElement);
  if (!target || isInsideExtensionUI(target)) return;

  highlightElement(target);
});

document.addEventListener(
  "click",
  (event) => {
    if (!isRecording) return;

    const target = getValidTarget(event.target as HTMLElement);
    if (!target || isInsideExtensionUI(target)) return;

    event.preventDefault();

    const selector = getSelector(target);

    const step: CapturedStep = {
      id: Date.now(),

      title:
        selector.text ||
        selector.ariaLabel ||
        selector.tagName,

      description: "Captured step",

      selector
    };

    capturedSteps.push(step);

    updatePanel();

    console.log("Captured Steps:", capturedSteps);

    target.style.boxShadow = "";
  },
  true
);