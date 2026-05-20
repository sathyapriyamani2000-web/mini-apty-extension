chrome.runtime.onInstalled.addListener(() => {
  console.log("Mini Apty installed");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message, sender);

  if (!message || message.type !== "apiRequest") {
    return false;
  }

  const { url, options } = (message.payload ?? {}) as {
    url: string;
    options: RequestInit;
  };

  if (!url) {
    sendResponse({ ok: false, error: "Missing URL" });
    return false;
  }

  fetch(url, options)
    .then(async (response) => {
      let body: unknown;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        body = await response.json();
      } else {
        body = await response.text();
      }

      sendResponse({
        ok: response.ok,
        status: response.status,
        body
      });
    })
    .catch((error) => {
      console.error("Background fetch error:", error);
      sendResponse({ ok: false, error: String(error) });
    });

  return true;
});
