// ==UserScript==
// @name         Googleカレンダー自動入力スクリプト
// @namespace    http://tampermonkey.net/
// @version      1.6.1

// @description  "MM/DD/タイトル" または "MM/DD-MM/DD/タイトル" の形式でGoogleカレンダーに素早く予定を追加します。色選択機能と一括追加機能付き。
// @author       ホタル
// @match        https://calendar.google.com/calendar/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ===== 設定 =====
    const CONFIG = {
        MAX_LOGS: 20,
        COMPACT_MODE: false,
    };

    // ===== 状態管理 =====
    let currentTask = null;
    let isCompactMode = CONFIG.COMPACT_MODE;
    let selectedColor = null;
    let isBatchProcessing = false;

    // ===== 色の定義 =====
    const COLOR_PALETTE = [
        { name: 'トマト', value: '#D50000' },
        { name: 'フラミンゴ', value: '#E67C73' },
        { name: 'ミカン', value: '#F4511E' },
        { name: 'バナナ', value: '#F6BF26' },
        { name: 'セージ', value: '#33B679' },
        { name: 'バジル', value: '#0B8043' },
        { name: 'ピーコック', value: '#039BE5' },
        { name: 'ブルーベリー', value: '#3F51B5' },
        { name: 'ラベンダー', value: '#7986CB' },
        { name: 'グレープ', value: '#8E24AA' },
        { name: 'グラファイト', value: '#616161' },
        { name: 'デフォルト', value: '#C0CA33' }
    ];

    // ===== CSSアニメーションの定義 =====
    const style = document.createElement('style');
    style.textContent = `
        @keyframes colorPulse {
            0% {
                transform: scale(1);
                box-shadow: 0 0 0 0 rgba(26, 115, 232, 0.7);
                border-color: #1a73e8;
            }
            50% {
                transform: scale(1.25);
                box-shadow: 0 0 0 8px rgba(26, 115, 232, 0.3);
                border-color: #1a73e8;
            }
            100% {
                transform: scale(1.15);
                box-shadow: 0 0 0 4px rgba(26, 115, 232, 0.5);
                border-color: #1a73e8;
            }
        }
        
        @keyframes smoothGlow {
            0% {
                box-shadow: 0 0 5px rgba(26, 115, 232, 0.5),
                            inset 0 0 10px rgba(255, 255, 255, 0.2);
            }
            50% {
                box-shadow: 0 0 20px rgba(26, 115, 232, 0.8),
                            inset 0 0 15px rgba(255, 255, 255, 0.4);
            }
            100% {
                box-shadow: 0 0 10px rgba(26, 115, 232, 0.6),
                            inset 0 0 12px rgba(255, 255, 255, 0.3);
            }
        }
        
        .color-button-selected {
            animation: colorPulse 0.6s ease-out forwards,
                      smoothGlow 1.5s ease-in-out infinite alternate !important;
            z-index: 10;
            position: relative;
        }
        
        .color-button-hover {
            transform: scale(1.1);
            box-shadow: 0 0 8px rgba(0, 0, 0, 0.3);
            transition: all 0.2s ease;
        }
        
        /* カラーツールチップ */
        .color-tooltip {
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            white-space: nowrap;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            margin-bottom: 5px;
            z-index: 100;
        }
        
        .color-tooltip::after {
            content: '';
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 4px solid transparent;
            border-top-color: rgba(0, 0, 0, 0.8);
        }
        
        .color-button:hover .color-tooltip {
            opacity: 1;
        }
        
        /* シンプルなモーダルスタイル */
        .batch-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 100000;
        }
        
        .batch-modal {
            background: white;
            border-radius: 8px;
            padding: 0;
            width: 500px;
            max-width: 90vw;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }
        
        .batch-modal-header {
            padding: 16px 20px;
            border-bottom: 1px solid #e0e0e0;
            background: #f8f9fa;
            border-radius: 8px 8px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .batch-modal-title {
            font-weight: 500;
            color: #202124;
            font-size: 16px;
        }
        
        .batch-modal-close {
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #5f6368;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
        }
        
        .batch-modal-close:hover {
            background: #f1f3f4;
        }
        
        .batch-modal-content {
            padding: 20px;
            flex: 1;
            overflow: auto;
        }
        
        .batch-textarea {
            width: 100%;
            height: 150px;
            border: 1px solid #dadce0;
            border-radius: 4px;
            padding: 12px;
            font-family: 'Roboto', sans-serif;
            font-size: 14px;
            resize: vertical;
            margin-bottom: 16px;
            box-sizing: border-box;
        }
        
        .batch-textarea:focus {
            outline: none;
            border-color: #1a73e8;
        }
        
        .batch-help {
            background: #f8f9fa;
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 16px;
            font-size: 12px;
            color: #5f6368;
            border-left: 4px solid #1a73e8;
        }
        
        .batch-help-title {
            font-weight: 500;
            margin-bottom: 8px;
            color: #202124;
        }

        /* 一括追加用カラーパレット */
        .batch-color-palette {
            margin-bottom: 12px;
            padding: 8px 0;
        }

        .batch-color-title {
            font-size: 12px;
            color: #5f6368;
            margin-bottom: 6px;
            font-weight: 500;
        }

        .batch-color-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            justify-content: center;
            margin-bottom: 8px;
        }

        .batch-color-button {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            border: 2px solid transparent;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
        }

        .batch-color-button:hover {
            transform: scale(1.1);
            box-shadow: 0 0 4px rgba(0,0,0,0.3);
        }

        .batch-color-tooltip {
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            white-space: nowrap;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            margin-bottom: 5px;
            z-index: 100;
        }

        .batch-color-tooltip::after {
            content: '';
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 4px solid transparent;
            border-top-color: rgba(0, 0, 0, 0.8);
        }

        .batch-color-button:hover .batch-color-tooltip {
            opacity: 1;
        }

        /* スラッシュオプション */
        .slash-option {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 8px;
            font-size: 12px;
            color: #5f6368;
        }

        .slash-checkbox {
            margin-right: 6px;
        }

        .slash-label {
            cursor: pointer;
        }


        .batch-modal-footer {
            padding: 16px 20px;
            border-top: 1px solid #e0e0e0;
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            background: #f8f9fa;
            border-radius: 0 0 8px 8px;
        }
        
        .batch-button {
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            border: none;
            min-width: 80px;
        }
        
        .batch-button-primary {
            background: #1a73e8;
            color: white;
        }
        
        .batch-button-primary:hover {
            background: #1669d6;
        }
        
        .batch-button-secondary {
            background: #f1f3f4;
            color: #5f6368;
        }
        
        .batch-button-secondary:hover {
            background: #e8eaed;
        }
        
        .batch-progress {
            margin-top: 16px;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 4px;
            display: none;
        }
        
        .batch-progress.active {
            display: block;
        }
        
        .batch-progress-bar {
            height: 6px;
            background: #e0e0e0;
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 8px;
        }
        
        .batch-progress-fill {
            height: 100%;
            background: #1a73e8;
            border-radius: 3px;
            transition: width 0.3s ease;
            width: 0%;
        }
        
        .batch-progress-text {
            font-size: 12px;
            color: #5f6368;
            text-align: center;
        }
        
        .batch-status {
            margin-top: 8px;
            padding: 8px;
            border-radius: 4px;
            font-size: 12px;
            text-align: center;
            display: none;
        }
        
        .batch-status.show {
            display: block;
        }
        
        .batch-status.success {
            background: #e6f4ea;
            color: #137333;
        }
        
        .batch-status.error {
            background: #fce8e6;
            color: #c5221f;
        }
    `;
    document.head.appendChild(style);

    // ===== UI関連のコード =====
    
    const mainContainer = document.createElement('div');
    mainContainer.id = 'gcal-auto-script-container';
    Object.assign(mainContainer.style, {
        userSelect: 'none',
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '10000',
        width: isCompactMode ? '200px' : '340px',
        backgroundColor: '#ffffff',
        border: '1px solid #dadce0',
        borderRadius: '16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        padding: isCompactMode ? '12px' : '16px',
        fontFamily: 'Roboto, "Segoe UI", sans-serif',
        fontSize: '14px',
        transition: 'all 0.3s ease',
        overflow: 'hidden'
    });

    // ドラッグできるようにする。
    mainContainer.onpointermove = function(event){
        if(event.buttons){
            this.style.left = this.offsetLeft + 2 * event.movementX + 'px'
            this.style.top = this.offsetTop  + 2 * event.movementY + 'px'
            this.style.position = 'absolute'
            this.draggable = false
            this.setPointerCapture(event.pointerId)
        }
    }

    document.body.appendChild(mainContainer);


    // ヘッダーの作成
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: ${isCompactMode ? '8px' : '12px'};
        padding-bottom: ${isCompactMode ? '6px' : '8px'};
        border-bottom: 1px solid #f1f3f4;
    `;

    const title = document.createElement('div');
    title.textContent = 'カレンダー自動入力';
    title.style.cssText = `
        font-weight: 600;
        color: #202124;
        font-size: ${isCompactMode ? '13px' : '14px'};
    `;

    const modeToggle = document.createElement('button');
    modeToggle.textContent = isCompactMode ? '🔍' : '⊝';
    modeToggle.title = isCompactMode ? '拡大表示' : 'コンパクト表示';
    modeToggle.style.cssText = `
        background: none;
        border: none;
        cursor: pointer;
        font-size: 16px;
        border-radius: 6px;
        color: #5f6368;
        transition: background-color 0.2s;
    `;

    header.appendChild(title);
    header.appendChild(modeToggle);
    mainContainer.appendChild(header);

    // 入力セクションの作成
    const inputSection = document.createElement('div');
    inputSection.style.cssText = `
        display: flex;
        gap: 8px;
        margin-bottom: ${isCompactMode ? '8px' : '12px'};
        flex-direction: ${isCompactMode ? 'column' : 'row'};
    `;

    const inputField = document.createElement('input');
    inputField.type = 'text';
    inputField.placeholder = '月/日/タイトル または 月/日-月/日/タイトル';
    inputField.style.cssText = `
        flex: 1;
        padding: ${isCompactMode ? '6px 8px' : '8px 12px'};
        border: 1px solid #dadce0;
        border-radius: 8px;
        font-size: ${isCompactMode ? '12px' : '13px'};
        outline: none;
        transition: border-color 0.2s;
    `;

    let addButton;

    if (!isCompactMode) {
        // 通常モード
        addButton = document.createElement('button');
        addButton.textContent = '予定を追加';
        addButton.style.cssText = `
            background-color: #1a73e8;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            white-space: nowrap;
            transition: background-color 0.2s;
        `;

        inputSection.appendChild(inputField);
        inputSection.appendChild(addButton);
    } else {
        // コンパクトモード
        addButton = document.createElement('button');
        addButton.textContent = '追加';
        addButton.style.cssText = `
            flex: 1;
            background-color: #1a73e8;
            color: white;
            border: none;
            border-radius: 6px;
            padding: 6px;
            font-size: 12px;
            cursor: pointer;
        `;

        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'クリア';
        clearBtn.style.cssText = `
            background-color: #f1f3f4;
            color: #5f6368;
            border: none;
            border-radius: 6px;
            padding: 6px 8px;
            font-size: 12px;
            cursor: pointer;
        `;

        const compactButtonRow = document.createElement('div');
        compactButtonRow.style.cssText = `
            display: flex;
            gap: 6px;
            justify-content: space-between;
        `;

        compactButtonRow.appendChild(addButton);
        compactButtonRow.appendChild(clearBtn);

        inputSection.appendChild(inputField);
        inputSection.appendChild(compactButtonRow);
    }

    mainContainer.appendChild(inputSection);

    // 一括追加ボタンの作成
    const batchButton = document.createElement('button');
    batchButton.textContent = '一括追加';
    batchButton.style.cssText = `
        width: 100%;
        background-color: #34a853;
        color: white;
        border: none;
        border-radius: 8px;
        padding: ${isCompactMode ? '6px' : '8px 16px'};
        font-size: ${isCompactMode ? '12px' : '13px'};
        font-weight: 500;
        cursor: pointer;
        margin-bottom: ${isCompactMode ? '8px' : '12px'};
        transition: background-color 0.2s;
    `;
    mainContainer.appendChild(batchButton);

    // ===== 色選択パレットの追加 =====
    const colorPaletteSection = document.createElement('div');
    colorPaletteSection.style.cssText = `
        margin-bottom: ${isCompactMode ? '8px' : '12px'};
        padding: ${isCompactMode ? '6px 0' : '8px 0'};
        border-bottom: 1px solid #f1f3f4;
    `;

    const colorPaletteTitle = document.createElement('div');
    colorPaletteTitle.textContent = '色を選択';
    colorPaletteTitle.style.cssText = `
        font-size: ${isCompactMode ? '11px' : '12px'};
        color: #5f6368;
        margin-bottom: 6px;
        font-weight: 500;
    `;

    const colorPalette = document.createElement('div');
    colorPalette.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        justify-content: center;
    `;

    // 色のボタンを作成
    COLOR_PALETTE.forEach(color => {
        const colorButton = document.createElement('button');
        colorButton.className = 'color-button';
        colorButton.title = color.name;
        colorButton.style.cssText = `
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border: 2px solid transparent;
            background-color: ${color.value};
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
        `;

        // ツールチップの追加
        const tooltip = document.createElement('div');
        tooltip.className = 'color-tooltip';
        tooltip.textContent = color.name;
        colorButton.appendChild(tooltip);

        // デフォルト色を選択状態に
        if (color.value === '#C0CA33') {
            selectedColor = color.value;
            colorButton.classList.add('color-button-selected');
        }

        colorButton.addEventListener('click', function() {
            // すべての色ボタンの選択状態をリセット
            colorPalette.querySelectorAll('button').forEach(btn => {
                btn.classList.remove('color-button-selected');
                btn.style.borderColor = 'transparent';
                btn.style.transform = 'scale(1)';
            });

            // 新しい色を選択状態に
            this.classList.add('color-button-selected');
            selectedColor = color.value;

            log(`色を選択: ${color.name}`, 'info');
            updateStatus(`色設定: ${color.name}`, 'info');
        });

        colorButton.addEventListener('mouseenter', function() {
            if (!this.classList.contains('color-button-selected')) {
                this.classList.add('color-button-hover');
            }
        });

        colorButton.addEventListener('mouseleave', function() {
            this.classList.remove('color-button-hover');
        });

        colorPalette.appendChild(colorButton);
    });

    colorPaletteSection.appendChild(colorPaletteTitle);
    colorPaletteSection.appendChild(colorPalette);
    mainContainer.appendChild(colorPaletteSection);

    // ステータスエリアの作成
    const statusArea = document.createElement('div');
    statusArea.id = 'gcal-status-area';
    statusArea.style.cssText = `
        padding: ${isCompactMode ? '6px 8px' : '8px 12px'};
        border-radius: 8px;
        margin-bottom: ${isCompactMode ? '6px' : '8px'};
        font-size: ${isCompactMode ? '11px' : '12px'};
        text-align: center;
        background-color: #f8f9fa;
        color: #5f6368;
        min-height: ${isCompactMode ? '16px' : '18px'};
        transition: all 0.3s ease;
    `;
    statusArea.textContent = '準備完了';
    mainContainer.appendChild(statusArea);

    // ログコンテナの作成（ヘッダー付き）
    const logContainer = document.createElement('div');
    logContainer.style.cssText = `
        margin-bottom: ${isCompactMode ? '6px' : '8px'};
    `;

    // ログヘッダーの作成
    const logHeader = document.createElement('div');
    logHeader.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
        padding: 0 4px;
    `;

    const logTitle = document.createElement('div');
    logTitle.textContent = '実行ログ';
    logTitle.style.cssText = `
        font-size: 11px;
        color: #5f6368;
        font-weight: 500;
    `;

    const logClearBtn = document.createElement('button');
    logClearBtn.textContent = 'クリア';
    logClearBtn.title = 'ログをクリア';
    logClearBtn.style.cssText = `
        background: none;
        border: none;
        color: #5f6368;
        font-size: 10px;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        transition: background-color 0.2s;
    `;

    logHeader.appendChild(logTitle);
    logHeader.appendChild(logClearBtn);
    logContainer.appendChild(logHeader);

    // ログエリアの作成
    const logArea = document.createElement('div');
    logArea.id = 'gcal-log-area';
    logArea.style.cssText = `
        max-height: ${isCompactMode ? '80px' : '120px'};
        overflow-y: auto;
        font-size: ${isCompactMode ? '10px' : '11px'};
        line-height: 1.3;
        border: 1px solid #f1f3f4;
        border-radius: 8px;
        padding: ${isCompactMode ? '6px' : '8px'};
        background-color: #fafbfc;
    `;

    logContainer.appendChild(logArea);

    if (!isCompactMode) {
        mainContainer.appendChild(logContainer);
    }

    // ===== 署名の追加 =====
    const signature = document.createElement('div');
    signature.className = 'script-signature';
    signature.textContent = 'Powerd by Firefly';
    mainContainer.appendChild(signature);

    // ===== 進捗ウィンドウの作成 =====
    function createProgressWindow(totalTasks) {
        // 既存の進捗ウィンドウをクリーンアップ
        if (progressWindow) {
            progressWindow.remove();
        }

        progressWindow = document.createElement('div');
        progressWindow.className = 'progress-window';

        // ヘッダー
        const header = document.createElement('div');
        header.className = 'progress-header';

        const title = document.createElement('div');
        title.className = 'progress-title';
        title.textContent = '一括追加の進捗';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'progress-close';
        closeBtn.textContent = '×';
        closeBtn.title = '閉じる';

        header.appendChild(title);
        header.appendChild(closeBtn);

        // コンテンツ
        const content = document.createElement('div');
        content.className = 'progress-content';

        // 進捗バーの追加
        const progressBarContainer = document.createElement('div');
        progressBarContainer.className = 'progress-bar-container';

        const progressBarFill = document.createElement('div');
        progressBarFill.className = 'progress-bar-fill';
        progressBarFill.style.width = '0%';

        progressBarContainer.appendChild(progressBarFill);
        content.appendChild(progressBarContainer);

        const taskListElement = document.createElement('ul');
        taskListElement.className = 'task-list';

        // タスクリストを初期化
        taskList = [];
        for (let i = 0; i < totalTasks; i++) {
            const taskItem = document.createElement('li');
            taskItem.className = 'task-item';

            const taskStatus = document.createElement('div');
            taskStatus.className = 'task-status';
            taskStatus.textContent = '⏳'; // 初期状態は待機中

            const taskName = document.createElement('div');
            taskName.className = 'task-name';
            taskName.textContent = `タスク ${i + 1}`;

            taskItem.appendChild(taskStatus);
            taskItem.appendChild(taskName);
            taskListElement.appendChild(taskItem);

            taskList.push({
                element: taskItem,
                status: taskStatus,
                name: taskName,
                completed: false,
                success: false,
                running: false
            });
        }

        content.appendChild(taskListElement);

        // サマリー
        const summary = document.createElement('div');
        summary.className = 'progress-summary';
        summary.textContent = `進捗: 0/${totalTasks}`;

        content.appendChild(summary);

        progressWindow.appendChild(header);
        progressWindow.appendChild(content);

        // イベントリスナー
        closeBtn.addEventListener('click', function() {
            progressWindow.remove();
            progressWindow = null;
        });

        document.body.appendChild(progressWindow);

        return {
            updateTask: function(index, success, message) {
                if (index >= 0 && index < taskList.length) {
                    const task = taskList[index];
                    task.completed = true;
                    task.success = success;
                    task.running = false;

                    if (message) {
                        task.name.textContent = message;
                    }

                    // ステータス絵文字を適切に設定
                    if (success) {
                        task.status.textContent = '✅';
                        task.element.className = 'task-item task-success';
                    } else {
                        task.status.textContent = '❌';
                        task.element.className = 'task-item task-error';
                    }

                    // 進捗バーとサマリーを更新
                    const completedCount = taskList.filter(t => t.completed).length;
                    const progressPercent = (completedCount / totalTasks) * 100;

                    progressBarFill.style.width = `${progressPercent}%`;

                    // すべてのタスクが完了したら「完了！」と表示
                    if (completedCount === totalTasks) {
                        summary.textContent = '完了！';
                        summary.className = 'progress-summary completed';
                        progressBarFill.className = 'progress-bar-fill completed';
                    } else {
                        summary.textContent = `進捗: ${completedCount}/${totalTasks}`;
                        summary.className = 'progress-summary';
                        progressBarFill.className = 'progress-bar-fill';
                    }
                }
            },
            setTaskRunning: function(index, message) {
                if (index >= 0 && index < taskList.length) {
                    const task = taskList[index];
                    task.running = true;
                    task.status.textContent = '🔄'; // 実行中は回転アイコン
                    if (message) {
                        task.name.textContent = message;
                    }
                    task.element.className = 'task-item';
                }
            },
            setTaskName: function(index, message) {
                if (index >= 0 && index < taskList.length) {
                    const task = taskList[index];
                    if (message) {
                        task.name.textContent = message;
                    }
                }
            },
            close: function() {
                if (progressWindow) {
                    progressWindow.remove();
                    progressWindow = null;
                }
            }
        };
    }

    // ===== 一括追加モーダルの作成（カラーパレット＋スラッシュオプション付き） =====
    function createBatchModal() {
        log('一括追加モーダルを作成します', 'info');
        
        // 既存のモーダルをクリーンアップ
        const existingModal = document.querySelector('.batch-modal-overlay');
        if (existingModal) {
            existingModal.remove();
            log('既存のモーダルをクリーンアップしました', 'info');
        }

        try {
            // オーバーレイの作成
            const overlay = document.createElement('div');
            overlay.className = 'batch-modal-overlay';

            // モーダルの作成
            const modal = document.createElement('div');
            modal.className = 'batch-modal';
            
            // ヘッダー
            const header = document.createElement('div');
            header.className = 'batch-modal-header';
            
            const title = document.createElement('div');
            title.className = 'batch-modal-title';
            title.textContent = '一括追加';
            
            const closeBtn = document.createElement('button');
            closeBtn.className = 'batch-modal-close';
            closeBtn.textContent = '×';
            closeBtn.title = '閉じる';
            
            header.appendChild(title);
            header.appendChild(closeBtn);
            
            // コンテンツ
            const content = document.createElement('div');
            content.className = 'batch-modal-content';
            
            const textarea = document.createElement('textarea');
            textarea.className = 'batch-textarea';
            textarea.placeholder = '月/日/タイトル/色 の形式で1行ずつ入力してください\n例:\n12/2/会議/トマト\n12/3/打ち合わせ\n12/4-12/6/イベント/ブルーベリー';


            // ===== カラーパレットの追加 =====
            const colorPaletteSection = document.createElement('div');
            colorPaletteSection.className = 'batch-color-palette';

            const colorPaletteTitle = document.createElement('div');
            colorPaletteTitle.className = 'batch-color-title';
            colorPaletteTitle.textContent = '色を選択（クリックで入力）:';

            const colorPalette = document.createElement('div');
            colorPalette.className = 'batch-color-buttons';

            // 色のボタンを作成
            COLOR_PALETTE.forEach(color => {
                const colorButton = document.createElement('button');
                colorButton.className = 'batch-color-button';
                colorButton.title = color.name;
                colorButton.style.backgroundColor = color.value;

                // ツールチップの追加
                const tooltip = document.createElement('div');
                tooltip.className = 'batch-color-tooltip';
                tooltip.textContent = color.name;
                colorButton.appendChild(tooltip);

                // クリックイベント
                colorButton.addEventListener('click', function() {
                    insertColorName(textarea, color.name, slashCheckbox.checked);
                });

                colorPalette.appendChild(colorButton);
            });

            // ===== スラッシュオプションの追加 =====
            const slashOption = document.createElement('div');
            slashOption.className = 'slash-option';

            const slashCheckbox = document.createElement('input');
            slashCheckbox.type = 'checkbox';
            slashCheckbox.className = 'slash-checkbox';
            slashCheckbox.id = 'slash-option';
            slashCheckbox.checked = true; // デフォルトでチェック

            const slashLabel = document.createElement('label');
            slashLabel.className = 'slash-label';
            slashLabel.htmlFor = 'slash-option';
            slashLabel.textContent = '色名の前にスラッシュを付ける（例: ' + (slashCheckbox.checked ? '/トマト' : 'トマト') + '）';

            // チェックボックスの変更イベント
            slashCheckbox.addEventListener('change', function() {
                slashLabel.textContent = '色名の前にスラッシュを付ける（例: ' + (this.checked ? '/トマト' : 'トマト') + '）';
            });

            slashOption.appendChild(slashCheckbox);
            slashOption.appendChild(slashLabel);

            colorPaletteSection.appendChild(colorPaletteTitle);
            colorPaletteSection.appendChild(colorPalette);
            colorPaletteSection.appendChild(slashOption); // スラッシュオプションを追加

            
            const help = document.createElement('div');
            help.className = 'batch-help';
            
            // TrustedHTMLエラー対策: innerHTMLを使わずに要素を構築
            const helpTitle = document.createElement('div');
            helpTitle.className = 'batch-help-title';
            helpTitle.textContent = '入力形式';
            
            const helpContent = document.createElement('div');
            
            // 各行を個別に作成
            const helpLines = [
                {strong: '基本形式:', text: '月/日/タイトル/色'},
                {strong: '期間指定:', text: '月/日-月/日/タイトル/色'},
                {strong: '色:', text: 'トマト, フラミンゴ, ミカン, バナナ, セージ, バジル, ピーコック, ブルーベリー, ラベンダー, グレープ, グラファイト, デフォルト'},
                {strong: '色の省略:', text: '色を省略すると現在選択中の色が使用されます'}
            ];
            
            helpLines.forEach(line => {
                const lineDiv = document.createElement('div');
                const strongEl = document.createElement('strong');
                strongEl.textContent = line.strong;
                lineDiv.appendChild(strongEl);
                lineDiv.appendChild(document.createTextNode(' ' + line.text));
                helpContent.appendChild(lineDiv);
            });
            
            help.appendChild(helpTitle);
            help.appendChild(helpContent);
            
            // 進捗表示
            const progress = document.createElement('div');
            progress.className = 'batch-progress';
            
            const progressBar = document.createElement('div');
            progressBar.className = 'batch-progress-bar';
            
            const progressFill = document.createElement('div');
            progressFill.className = 'batch-progress-fill';
            
            const progressText = document.createElement('div');
            progressText.className = 'batch-progress-text';
            progressText.textContent = '準備中...';
            
            progressBar.appendChild(progressFill);
            progress.appendChild(progressBar);
            progress.appendChild(progressText);
            
            const status = document.createElement('div');
            status.className = 'batch-status';
            
            content.appendChild(textarea);
            content.appendChild(help);
            content.appendChild(progress);
            content.appendChild(status);
            
            // フッター
            const footer = document.createElement('div');
            footer.className = 'batch-modal-footer';
            
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'batch-button batch-button-secondary';
            cancelBtn.textContent = 'キャンセル';
            
            const executeBtn = document.createElement('button');
            executeBtn.className = 'batch-button batch-button-primary';
            executeBtn.textContent = '実行';
            
            footer.appendChild(cancelBtn);
            footer.appendChild(executeBtn);
            
            modal.appendChild(header);
            modal.appendChild(content);
            modal.appendChild(footer);
            overlay.appendChild(modal);
            
            // イベントリスナー - 関数式を使用
            function closeModal() {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                    log('一括追加モーダルを閉じました', 'info');
                }
            }
            
            closeBtn.addEventListener('click', closeModal);
            cancelBtn.addEventListener('click', closeModal);
            
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) {
                    closeModal();
                }
            });
            
            executeBtn.addEventListener('click', function() {
                const lines = textarea.value.split('\n').filter(line => line.trim());
                if (lines.length === 0) {
                    status.textContent = '入力がありません';
                    status.className = 'batch-status error show';
                    log('一括追加: 入力がありません', 'error');
                    return;
                }
                
                log(`一括追加: ${lines.length}件の予定を処理開始`, 'info');
                executeBatch(lines, progress, progressFill, progressText, status, closeModal);
            });
            
            // モーダルをDOMに追加
            document.body.appendChild(overlay);
            log('一括追加モーダルを表示しました', 'success');
            
            // テキストエリアにフォーカス
            textarea.focus();
            
        } catch (error) {
            log(`モーダル作成エラー: ${error.message}`, 'error');
            // フォールバック: シンプルなプロンプトで代用
            fallbackBatchInput();
        }
    }
  
    // ===== 色名挿入関数（スラッシュオプション対応） =====
    function insertColorName(textarea, colorName, addSlash) {
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;
        const text = textarea.value;

        // 挿入するテキストを決定（スラッシュオプションに基づく）
        const insertText = addSlash ? `/${colorName}` : colorName;

        // カーソル位置に色名を挿入
        textarea.value = text.substring(0, startPos) + insertText + text.substring(endPos);

        // カーソルを挿入したテキストの後に移動
        textarea.selectionStart = startPos + insertText.length;
        textarea.selectionEnd = startPos + insertText.length;

        // フォーカスを戻す
        textarea.focus();

        log(`色名「${insertText}」を入力しました`, 'info');
    }

    // ===== 進捗表示付き一括実行関数 =====
    async function executeBatchWithProgress(lines) {
        if (isBatchProcessing) {
            log('一括追加: 既に処理中です', 'error');
            return;
        }

        isBatchProcessing = true;

        // 進捗ウィンドウを作成
        const progressManager = createProgressWindow(lines.length);
        let successCount = 0;
        let errorCount = 0;

        // イベントをパース
        const events = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parsedData = parseInput(line);
            if (parsedData) {
                events.push({
                    data: parsedData,
                    index: i,
                    originalText: line
                });
                // タスク名だけを設定（状態は未実行のまま）
                progressManager.setTaskName(i, parsedData.title);
            } else {
                errorCount++;
                // 解析失敗の場合は即座に失敗としてマーク
                progressManager.updateTask(i, false, `解析失敗: ${line}`);
                log(`一括追加: 行 ${i + 1} の解析に失敗 - ${line}`, "error");
            }
        }

        if (events.length === 0) {
            log('一括追加: 有効なイベントがありません', 'error');
            isBatchProcessing = false;
            progressManager.close();
            return;
        }

        log(`一括追加: ${events.length}件のイベントを処理開始`, 'info');

        // イベントを順次実行
        for (let i = 0; i < events.length; i++) {
            const event = events[i];

            // 実行中ステータスを設定
            progressManager.setTaskRunning(event.index, event.data.title);

            try {
                await createSingleEvent(event.data);
                successCount++;
                progressManager.updateTask(event.index, true, event.data.title);
                log(`一括処理: ${event.data.title} を追加しました`, "success");
            } catch (error) {
                errorCount++;
                progressManager.updateTask(event.index, false, `${event.data.title} (失敗)`);
                log(`一括処理: ${event.data.title} の追加に失敗 - ${error.message}`, "error");
            }

            // 次のイベントまでの待機
            await wait(1000);
        }

        // 完了処理
        log(`一括追加: 完了 - ${successCount}成功, ${errorCount}失敗`,
            errorCount === 0 ? 'success' : 'warning');

        isBatchProcessing = false;
    }
    // ===== フォールバック関数 =====
    function fallbackBatchInput() {
        log('フォールバックモードで一括入力を開始します', 'info');
        
        const input = prompt(
            '月/日/タイトル/色 の形式で1行ずつ入力してください（例）:\n\n' +
            '12/2/会議/トマト\n' +
            '12/3/打ち合わせ\n' +
            '12/4-12/6/イベント/ブルーベリー\n\n' +
            '色の指定がない場合は現在選択中の色が使用されます。'
        );
        
        if (input) {
            const lines = input.split('\n').filter(line => line.trim());
            if (lines.length > 0) {
                log(`フォールバック: ${lines.length}件の予定を処理開始`, 'info');
                
                // シンプルな進捗表示
                const progress = document.createElement('div');
                progress.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    z-index: 100000;
                    text-align: center;
                `;
                
                const progressText = document.createElement('div');
                progressText.textContent = `処理中: 0/${lines.length}`;
                
                progress.appendChild(progressText);
                document.body.appendChild(progress);
                
                // 簡易バッチ実行
                executeSimpleBatch(lines, progress, progressText);
            }
        }
    }

    // ===== 簡易バッチ実行関数 =====
    async function executeSimpleBatch(lines, progress, progressText) {
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            progressText.textContent = `処理中: ${i + 1}/${lines.length} - ${line}`;
            
            try {
                const parsedData = parseInput(line);
                if (parsedData) {
                    await createSingleEvent(parsedData);
                    successCount++;
                    log(`簡易一括: ${parsedData.title} を追加しました`, "success");
                } else {
                    errorCount++;
                    log(`簡易一括: 行 ${i + 1} の解析に失敗 - ${line}`, "error");
                }
            } catch (error) {
                errorCount++;
                log(`簡易一括: 行 ${i + 1} の処理に失敗 - ${error.message}`, "error");
            }
            
            await wait(1000);
        }
        
        progressText.textContent = `完了: ${successCount}成功, ${errorCount}失敗`;
        log(`簡易一括完了: ${successCount}成功, ${errorCount}失敗`, 
            errorCount === 0 ? 'success' : 'warning');
        
        // 3秒後に進捗表示を削除
        setTimeout(function() {
            if (progress.parentNode) {
                progress.parentNode.removeChild(progress);
            }
        }, 3000);
    }

    // ===== イベントリスナーの設定（関数式を使用） =====
    modeToggle.addEventListener('mouseenter', function() {
        this.style.backgroundColor = '#f8f9fa';
    });
    
    modeToggle.addEventListener('mouseleave', function() {
        this.style.backgroundColor = 'transparent';
    });

    inputField.addEventListener('focus', function() {
        this.style.borderColor = '#1a73e8';
    });
    
    inputField.addEventListener('blur', function() {
        this.style.borderColor = '#dadce0';
    });

    addButton.addEventListener('mouseenter', function() {
        this.style.backgroundColor = '#1669d6';
    });
    
    addButton.addEventListener('mouseleave', function() {
        this.style.backgroundColor = '#1a73e8';
    });

    batchButton.addEventListener('mouseenter', function() {
        this.style.backgroundColor = '#2e8b47';
    });
    
    batchButton.addEventListener('mouseleave', function() {
        this.style.backgroundColor = '#34a853';
    });

    // 一括追加ボタンのイベントリスナー
    batchButton.addEventListener('click', function() {
        log('一括追加ボタンがクリックされました', 'info');
        createBatchModal();
    });

    // ===== ユーティリティ関数 =====
    function updateStatus(message, type = 'info') {
        const colors = {
            info: { bg: '#e8f0fe', color: '#1a73e8' },
            success: { bg: '#e6f4ea', color: '#137333' },
            warning: { bg: '#fef7e0', color: '#f9ab00' },
            error: { bg: '#fce8e6', color: '#c5221f' }
        };
        const style = colors[type] || colors.info;
        statusArea.style.backgroundColor = style.bg;
        statusArea.style.color = style.color;
        statusArea.textContent = message;
        statusArea.style.fontWeight = (type === 'error' || type === 'warning') ? '500' : 'normal';
    }

    function log(message, type = 'info') {
        const now = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const typeStyles = {
            info: { color: '#5f6368', prefix: 'ℹ' },
            success: { color: '#137333', prefix: '✅' },
            warning: { color: '#f9ab00', prefix: '⚠' },
            error: { color: '#c5221f', prefix: '❌' }
        };
        const style = typeStyles[type] || typeStyles.info;
        console.log(`[${now}] ${style.prefix} ${message}`);
        
        if (isCompactMode) {
            updateStatus(message, type);
        }
    }

    function setTask(taskName) {
        currentTask = taskName;
        log(`タスク開始: ${taskName}`, 'info');
        updateStatus(`実行中: ${taskName}`, 'info');
    }

    function clearTask() {
        if (currentTask) {
            log(`タスク完了: ${currentTask}`, 'success');
            currentTask = null;
        }
        updateStatus('準備完了', 'success');
    }

    // ===== 入力解析関数 =====
    function parseInput(input) {
        const trimmed = input.trim();
        
        // 色指定付きのパターン: "月/日/タイトル/色" または "月/日-月/日/タイトル/色"
        const rangeWithColorPattern = /^(\d{1,2})\/(\d{1,2})-(\d{1,2})\/(\d{1,2})\/([^\/]+)\/([^\/]+)$/;
        const singleWithColorPattern = /^(\d{1,2})\/(\d{1,2})\/([^\/]+)\/([^\/]+)$/;
        
        const rangeWithColorMatch = trimmed.match(rangeWithColorPattern);
        const singleWithColorMatch = trimmed.match(singleWithColorPattern);
        
        if (rangeWithColorMatch) {
            const colorName = rangeWithColorMatch[6];
            const color = COLOR_PALETTE.find(c => c.name === colorName);
            return {
                type: 'range',
                startMonth: rangeWithColorMatch[1],
                startDay: rangeWithColorMatch[2],
                endMonth: rangeWithColorMatch[3],
                endDay: rangeWithColorMatch[4],
                title: rangeWithColorMatch[5].trim(),
                color: color ? color.value : selectedColor,
                colorName: colorName
            };
        }
        
        if (singleWithColorMatch) {
            const colorName = singleWithColorMatch[4];
            const color = COLOR_PALETTE.find(c => c.name === colorName);
            return {
                type: 'single',
                month: singleWithColorMatch[1],
                day: singleWithColorMatch[2],
                title: singleWithColorMatch[3].trim(),
                color: color ? color.value : selectedColor,
                colorName: colorName
            };
        }
        
        // 色指定なしのパターン（既存のロジック）
        const rangePattern = /^(\d{1,2})\/(\d{1,2})-(\d{1,2})\/(\d{1,2})\/(.+)$/;
        const singlePattern = /^(\d{1,2})\/(\d{1,2})\/(.+)$/;
        
        const rangeMatch = trimmed.match(rangePattern);
        const singleMatch = trimmed.match(singlePattern);
        
        if (rangeMatch) {
            return {
                type: 'range',
                startMonth: rangeMatch[1],
                startDay: rangeMatch[2],
                endMonth: rangeMatch[3],
                endDay: rangeMatch[4],
                title: rangeMatch[5].trim(),
                color: selectedColor,
                colorName: '現在の色'
            };
        }
        
        if (singleMatch) {
            return {
                type: 'single',
                month: singleMatch[1],
                day: singleMatch[2],
                title: singleMatch[3].trim(),
                color: selectedColor,
                colorName: '現在の色'
            };
        }
        
        return null;
    }

    // ===== カレンダー操作関数 =====
    async function wait(ms) {
        return new Promise(function(resolve) {
            setTimeout(resolve, ms);
        });
    }

    function waitForElement(selector, timeout = 5000) {
        return new Promise(function(resolve, reject) {
            const intervalTime = 100;
            let elapsedTime = 0;
            const interval = setInterval(function() {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                }
                elapsedTime += intervalTime;
                if (elapsedTime >= timeout) {
                    clearInterval(interval);
                    reject(new Error(`タイムアウト: 要素が見つかりません (${selector})`));
                }
            }, intervalTime);
        });
    }

    function findButtonByText(text) {
        const buttons = document.querySelectorAll('button, div[role="button"]');
        for (let i = 0; i < buttons.length; i++) {
            const button = buttons[i];
            if (button.textContent.trim().includes(text)) {
                if (text === '保存' && button.textContent.trim() !== '保存') continue;
                return button;
            }
        }
        return null;
    }

    async function toggleAllDayIfNeeded() {
        try {
            const selectors = [
                'div[role="checkbox"][aria-label="終日"]',
                'input[type="checkbox"][aria-label="終日"]',
                '[jsname="hzLCid"]',
            ];
            for (let i = 0; i < selectors.length; i++) {
                const selector = selectors[i];
                const element = document.querySelector(selector);
                if (element) {
                    const isChecked = element.getAttribute('aria-checked') === 'true' || element.checked === true;
                    if (!isChecked) {
                        element.click();
                        log("「終日」を有効化", "info");
                        await wait(300);
                    }
                    return true;
                }
            }
            return false;
        } catch (error) {
            log(`終日チェックボックス操作エラー: ${error.message}`, "warning");
            return false;
        }
    }

    /**
     * 色を設定する関数
     */
    async function setEventColor(color = null) {
        const targetColor = color || selectedColor;
        if (!targetColor) {
            log("色が選択されていません。デフォルトの色を使用します。", "info");
            return false;
        }

        try {
            log(`色設定を開始: ${targetColor}`, "info");

            // 色選択ボタンを探す
            const colorButton = document.querySelector('button[aria-label="カレンダーの色、予定の色"], [jsname="kRX3Ve"]');
            if (!colorButton) {
                throw new Error("色選択ボタンが見つかりません");
            }

            // 色選択ボタンをクリックしてメニューを開く
            colorButton.click();
            log("色選択メニューを開きました", "info");
            await wait(800);

            // 指定された色の要素を探す
            const colorElement = document.querySelector(`[data-color="${targetColor}"]`);
            if (!colorElement) {
                throw new Error(`指定された色の要素が見つかりません: ${targetColor}`);
            }

            // 色をクリック
            colorElement.click();
            log(`色を設定しました: ${targetColor}`, "success");
            await wait(500);

            // 色選択メニューを閉じる（ESCキーを送信）
            const escEvent = new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                which: 27,
                bubbles: true
            });
            document.activeElement.dispatchEvent(escEvent);
            
            await wait(300);
            return true;

        } catch (error) {
            log(`色設定エラー: ${error.message}`, "warning");
            return false;
        }
    }

    /**
     * シンプルな日付設定関数 - エンターキーののみを使用
     */
    async function setDateWithEnter(startMonth, startDay, endMonth = null, endDay = null) {
        log("シンプルな日付設定を開始", "info");
        
        const isRange = endMonth !== null && endDay !== null;
        const year = new Date().getFullYear();
        
        // 開始日の設定
        const startDateInput = await waitForElement('input[aria-label*="開始日"]');
        if (!startDateInput) {
            throw new Error("開始日入力フィールドが見つかりません");
        }

        const startFormattedDate = `${year}年${startMonth}月${startDay}日`;

        // 開始日を入力してエンター
        log(`開始日を入力: ${startFormattedDate}`, "info");
        startDateInput.focus();
        startDateInput.select();
        startDateInput.value = startFormattedDate;

        // 入力イベントを発火
        startDateInput.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(200);

        // エンターキーで確定
        log("開始日にエンターキーを送信", "info");
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
        });
        startDateInput.dispatchEvent(enterEvent);
        await wait(800);

        // 期間指定の場合、終了日も設定
        if (isRange) {
            const endDateInput = await waitForElement('input[aria-label*="終了日"]');
            if (!endDateInput) {
                throw new Error("終了日入力フィールドが見つかりません");
            }

            const endFormattedDate = `${year}年${endMonth}月${endDay}日`;
            log(`終了日を入力: ${endFormattedDate}`, "info");

            endDateInput.focus();
            endDateInput.select();
            endDateInput.value = endFormattedDate;

            // 入力イベントを発火
            endDateInput.dispatchEvent(new Event('input', { bubbles: true }));
            await wait(200);

            // エンターキーで確定
            log("終了日にエンターキーを送信", "info");
            endDateInput.dispatchEvent(enterEvent);
            await wait(800);
        }

        // 最終確認
        const startFinalValue = startDateInput.value;
        const startSuccess = startFinalValue.includes(`${startMonth}月${startDay}日`) || 
                           startFinalValue.includes(`${year}年${startMonth}月${startDay}日`) ||
                           startFinalValue.includes(`${startMonth}/${startDay}`);

        let endSuccess = true;
        if (isRange) {
            const endDateInput = document.querySelector('input[aria-label*="終了日"]');
            if (endDateInput) {
                const endFinalValue = endDateInput.value;
                endSuccess = endFinalValue.includes(`${endMonth}月${endDay}日`) || 
                           endFinalValue.includes(`${year}年${endMonth}月${endDay}日`) ||
                           endFinalValue.includes(`${endMonth}/${endDay}`);
            }
        }

        if (startSuccess && endSuccess) {
            const successMessage = isRange ? 
                `日付設定成功: ${startMonth}/${startDay} - ${endMonth}/${endDay}` : 
                `日付設定成功: ${startMonth}/${startDay}`;
            log(successMessage, "success");
            return true;
        } else {
            log(`日付が完全に反映されていません。開始日: ${startFinalValue}`, "warning");
            return false;
        }
    }

    /**
     * 一括実行関数
     */
    async function executeBatch(lines, progress, progressFill, progressText, status, closeModal) {
        if (isBatchProcessing) {
            status.textContent = '既に処理中です';
            status.className = 'batch-status error show';
            log('一括追加: 既に処理中です', 'error');
            return;
        }

        isBatchProcessing = true;
        progress.classList.add('active');
        let successCount = 0;
        let errorCount = 0;

        // パースしてキューに追加
        const events = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parsedData = parseInput(line);
            if (parsedData) {
                events.push(parsedData);
                log(`一括追加: 行 ${i + 1} を解析 - ${parsedData.title}`, 'info');
            } else {
                log(`一括追加: 行 ${i + 1} の解析に失敗 - ${line}`, "error");
                errorCount++;
            }
        }

        if (events.length === 0) {
            status.textContent = '有効なイベントがありません';
            status.className = 'batch-status error show';
            log('一括追加: 有効なイベントがありません', 'error');
            isBatchProcessing = false;
            progress.classList.remove('active');
            return;
        }

        log(`一括追加: ${events.length}件のイベントを処理開始`, 'info');

        // イベントを順次実行
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            const progressPercent = ((i + 1) / events.length) * 100;
            
            progressFill.style.width = `${progressPercent}%`;
            progressText.textContent = `処理中: ${i + 1}/${events.length} (${event.title})`;
            
            try {
                await createSingleEvent(event);
                successCount++;
                log(`一括処理: ${event.title} を追加しました`, "success");
            } catch (error) {
                errorCount++;
                log(`一括処理: ${event.title} の追加に失敗 - ${error.message}`, "error");
            }
            
            // 次のイベントまでの待機
            await wait(1000);
        }

        // 完了処理
        progressText.textContent = `完了: ${successCount}成功, ${errorCount}失敗`;
        status.textContent = `一括処理が完了しました: ${successCount}成功, ${errorCount}失敗`;
        status.className = errorCount === 0 ? 'batch-status success show' : 'batch-status error show';
        
        log(`一括追加: 完了 - ${successCount}成功, ${errorCount}失敗`, 
            errorCount === 0 ? 'success' : 'warning');
        
        isBatchProcessing = false;
        
        // 3秒後にモーダルを閉じる
        setTimeout(function() {
            if (errorCount === 0) {
                closeModal();
            }
        }, 3000);
    }

    /**
     * 単一イベント作成関数（一括処理用）
     */
    async function createSingleEvent(parsedData) {
        let taskName;
        if (parsedData.type === 'range') {
            taskName = `予定作成: ${parsedData.title} (${parsedData.startMonth}/${parsedData.startDay}-${parsedData.endMonth}/${parsedData.endDay})`;
        } else {
            taskName = `予定作成: ${parsedData.title} (${parsedData.month}/${parsedData.day})`;
        }
        
        setTask(taskName);

        // 1. 作成ボタンをクリック
        const createButton = document.querySelector('div[jsname="LF4U9b"]') || findButtonByText('作成');
        if (!createButton) throw new Error('「作成」ボタンが見つかりません');
        createButton.click();

        // 2. ダイアログが表示されるのを待つ
        await waitForElement('div[role="dialog"]');
        log("ダイアログを開きました", "success");

        // 3. タイトル入力
        const titleInput = await waitForElement('input[aria-label="タイトルと日時を追加"], input[aria-label="タイトルを追加"], input[aria-label="タイトル"]');
        titleInput.focus();
        titleInput.value = parsedData.title;
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
        log(`タイトル入力: ${parsedData.title}`, "success");
        await wait(300);

        // 4. 終日を有効化
        await toggleAllDayIfNeeded();

        // 5. 日付をシンプルな方法で設定
        let dateSet;
        if (parsedData.type === 'range') {
            dateSet = await setDateWithEnter(
                parsedData.startMonth, 
                parsedData.startDay, 
                parsedData.endMonth, 
                parsedData.endDay
            );
        } else {
            dateSet = await setDateWithEnter(parsedData.month, parsedData.day);
        }
        
        if (!dateSet) {
            log("日付の設定に問題がありましたが処理を続行します", "warning");
        }

        // 6. 色設定（指定された色を使用）
        await setEventColor(parsedData.color);

        // 7. 追加の待機時間を設ける
        await wait(1000);

        // 8. 保存
        const saveButton = findButtonByText('保存');
        if (saveButton) {
            saveButton.click();
            log("保存ボタンをクリック", "success");
            updateStatus(`予定「${parsedData.title}」を追加しました`, "success");
            await wait(1500);
        } else {
            throw new Error('「保存」ボタンが見つかりません');
        }

        clearTask();
    }

    /**
     * メインのイベント作成フロー
     */
    async function createEvent(parsedData) {
        try {
            await createSingleEvent(parsedData);
        } catch (error) {
            log(`エラー: ${error.message}`, "error");
            updateStatus(`エラー: ${error.message}`, "error");
            currentTask = null;
        }
    }

    // ===== メインイベントリスナーの設定 =====
    function addEventHandler() {
        const eventString = inputField.value.trim();
        if (!eventString) {
            updateStatus('入力してください', 'warning');
            inputField.focus();
            return;
        }
        
        const parsedData = parseInput(eventString);
        if (!parsedData) {
            updateStatus('形式: 月/日/タイトル または 月/日-月/日/タイトル', 'warning');
            log('入力形式が不正です', 'warning');
            return;
        }
        
        inputField.value = '';
        createEvent(parsedData);
    }

    addButton.addEventListener('click', addEventHandler);
    
    inputField.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addEventHandler();
        }
    });

    // コンパクトモードのクリアボタンのイベントリスナー
    if (isCompactMode) {
        const clearBtn = inputSection.querySelector('button:nth-child(2)');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                inputField.value = '';
                inputField.focus();
                updateStatus('入力がクリアされました', 'info');
            });
        }
    }

    // モード切り替えのイベントリスナー
    modeToggle.addEventListener('click', function() {
        isCompactMode = !isCompactMode;
        mainContainer.style.width = isCompactMode ? '200px' : '340px';
        mainContainer.style.padding = isCompactMode ? '12px' : '16px';
        modeToggle.textContent = isCompactMode ? '🔍' : '⊝';
        modeToggle.title = isCompactMode ? '拡大表示' : 'コンパクト表示';
        
        log(`表示モードを${isCompactMode ? 'コンパクト' : '標準'}に切り替え`, 'info');
    });

    // 初期化完了
    log('スクリプト v1.6.1 が初期化されました', 'success');
    log('作者: ホタル', 'info');
    log('一括追加ウィンドウにスラッシュオプションを追加しました', 'info');
    log('完了時に「完了！」と表示されるようになりました', 'info');
    log('完了時に進捗バーが緑色に変わります', 'info');
    log('入力例: "11/23/会議" または "11/2-11/5/ハロウィン"', 'info');
})();
