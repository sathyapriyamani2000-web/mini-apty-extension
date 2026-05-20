const url = "http://localhost:3000/health";

async function run() {
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    const data = await response.json();
    if (data && data.ok) {
      console.log("Backend health check passed");
      process.exit(0);
    }

    throw new Error("Backend returned unexpected health payload");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

run();