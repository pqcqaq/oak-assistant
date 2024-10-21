import path from 'path';
import { Worker } from 'worker_threads';
import * as vscode from 'vscode';

let worker: Worker | null = null;

export const startWorker = () => {
    if (!worker) {
        worker = new Worker(path.join(__dirname, 'utils', 'analyzeWorker.js'));
        worker.on('exit', (code) => {
            console.log(`worker exit with code ${code}`);
            if (code !== 0) {
                vscode.window.showErrorMessage(
                    'Worker意外退出，Code:' + code,
                    '正在尝试重新启动.....'
                );
                startWorker();
            }
            worker = null;
        });
    } else {
        console.log('worker already started');
    }
};

export const waitWorkerReady = async () => {
    return new Promise<void>((resolve) => {
        if (!worker) {
            throw new Error('worker not started');
        }
        worker.once('message', (message) => {
            if (message === 'ready') {
                resolve();
            }
        });
    });
};

export const getWorker = () => {
    if (!worker) {
        throw new Error('worker not started');
    }
    return worker;
};

/**
 * 停止worker
 */
export const stopWorker = () => {
    worker?.terminate();
};
