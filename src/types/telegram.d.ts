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
        colorScheme: "light" | "dark";
        ready(): void;
        expand(): void;
        close(): void;
        openTelegramLink(url: string): void;
        onEvent(eventType: "themeChanged", callback: () => void): void;
        offEvent(eventType: "themeChanged", callback: () => void): void;
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
