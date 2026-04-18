import "./load-env.js";

const requiredEnvironment = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] as const;

function missingEnvironment() {
  return requiredEnvironment.filter((key) => !process.env[key]);
}

async function main() {
  const missing = missingEnvironment();

  if (missing.length > 0) {
    console.log(
      `Agent worker is in standby. Missing LiveKit configuration: ${missing.join(", ")}`
    );
    return;
  }

  console.log("Agent worker ready. LiveKit integration will be attached in the next milestone.");
}

await main();
