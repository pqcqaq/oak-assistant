export {}; // This ensures the file is treated as a module

declare global {
    interface oakLogger {
        log: (...args: any[]) => void;
        error: (...args: any[]) => void;
        warn: (...args: any[]) => void;
        info: (...args: any[]) => void;
    }
}