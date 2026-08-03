export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        colorScheme: "light" | "dark";
        ready(): void;
        expand(): void;
        close(): void;
        openTelegramLink(url: string): void;
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
