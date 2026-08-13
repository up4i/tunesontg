export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe?: {
          start_param?: string;
        };
        version: string;
        platform: string;
        colorScheme: "light" | "dark";
        ready(): void;
        expand(): void;
        close(): void;
        openTelegramLink(url: string): void;
        addToHomeScreen?(): void;
        checkHomeScreenStatus?(callback: (status: "unsupported" | "unknown" | "added" | "missed") => void): void;
        onEvent(eventType: "themeChanged" | "homeScreenAdded" | "homeScreenChecked", callback: (...args: unknown[]) => void): void;
        offEvent(eventType: "themeChanged" | "homeScreenAdded" | "homeScreenChecked", callback: (...args: unknown[]) => void): void;
        isVersionAtLeast(version: string): boolean;
        setHeaderColor(color: string): void;
        setBackgroundColor(color: string): void;
        HapticFeedback?: {
          impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
          notificationOccurred(type: "error" | "success" | "warning"): void;
          selectionChanged(): void;
        };
      };
    };
  }
}
