import { createRoot } from "react-dom/client";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("EthosLayer could not find its app container.");
}

const root = createRoot(rootElement);

async function startApp() {
  // Hide the native launch screen before loading the rest of the application.
  // This prevents a dependency failure from leaving users trapped on a splash
  // screen with no way to see or recover from the problem.
  try {
    const [{ Capacitor }, { SplashScreen }] = await Promise.all([
      import("@capacitor/core"),
      import("@capacitor/splash-screen"),
    ]);
    if (Capacitor.isNativePlatform()) await SplashScreen.hide();
  } catch {
    // Browser builds and older native shells do not require the plugin.
  }

  try {
    const { default: App } = await import("./App.tsx");
    root.render(<App />);
  } catch (error) {
    console.error("EthosLayer startup failed", error);
    root.render(
      <main className="min-h-screen bg-background text-foreground grid place-items-center px-6 text-center">
        <div>
          <img src="/icons/icon-192.png" alt="EthosLayer" className="mx-auto mb-5 h-20 w-20 rounded-xl" />
          <h1 className="text-xl font-semibold">EthosLayer couldn't start</h1>
          <p className="mt-2 text-sm text-muted-foreground">Close the app and open it again.</p>
        </div>
      </main>,
    );
  }
}

void startApp();
