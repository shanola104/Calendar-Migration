// ==UserScript==
// @name         Googleカレンダー自動入力スクリプト
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  "MM/DD/タイトル" または "MM/DD-MM/DD/タイトル" の形式でGoogleカレンダーに素早く予定を追加します。色選択機能付き。
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
    `;
    document.head.appendChild(style);

    // ===== UI関連のコード =====
    const mainContainer = document.createElement('div');
    mainContainer.id = 'gcal-auto-script-container';
    Object.assign(mainContainer.style, {
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
        padding: 4px 8px;
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

    // ===== イベントリスナーの設定 =====
    modeToggle.addEventListener('mouseenter', function() {
        modeToggle.style.backgroundColor = '#f8f9fa';
    });

    modeToggle.addEventListener('mouseleave', function() {
        modeToggle.style.backgroundColor = 'transparent';
    });

    inputField.addEventListener('focus', function() {
        inputField.style.borderColor = '#1a73e8';
    });

    inputField.addEventListener('blur', function() {
        inputField.style.borderColor = '#dadce0';
    });

    addButton.addEventListener('mouseenter', function() {
        addButton.style.backgroundColor = '#1669d6';
    });

    addButton.addEventListener('mouseleave', function() {
        addButton.style.backgroundColor = '#1a73e8';
    });

    // ログクリアボタンのイベントリスナー
    logClearBtn.addEventListener('mouseenter', function() {
        logClearBtn.style.backgroundColor = '#f1f3f4';
    });

    logClearBtn.addEventListener('mouseleave', function() {
        logClearBtn.style.backgroundColor = 'transparent';
    });

    logClearBtn.addEventListener('click', function() {
        logArea.innerHTML = '';
        log('ログをクリアしました', 'info');
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
        const logEntry = document.createElement('div');
        const typeStyles = {
            info: { color: '#5f6368', prefix: 'ℹ' },
            success: { color: '#137333', prefix: '✅' },
            warning: { color: '#f9ab00', prefix: '⚠' },
            error: { color: '#c5221f', prefix: '❌' }
        };
        const style = typeStyles[type] || typeStyles.info;
        logEntry.style.color = style.color;
        logEntry.style.marginBottom = '2px';
        logEntry.textContent = `[${now}] ${style.prefix} ${message}`;

        if (isCompactMode) {
            updateStatus(message, type);
        } else {
            logArea.appendChild(logEntry);

            // 最大ログ数を超えたら古いものから削除
            while (logArea.children.length > CONFIG.MAX_LOGS) {
                logArea.removeChild(logArea.firstChild);
            }

            // 自動スクロール
            logArea.scrollTop = logArea.scrollHeight;
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

        // 期間指定のパターン: "月/日-月/日/タイトル"
        const rangePattern = /^(\d{1,2})\/(\d{1,2})-(\d{1,2})\/(\d{1,2})\/(.+)$/;
        const rangeMatch = trimmed.match(rangePattern);

        if (rangeMatch) {
            return {
                type: 'range',
                startMonth: rangeMatch[1],
                startDay: rangeMatch[2],
                endMonth: rangeMatch[3],
                endDay: rangeMatch[4],
                title: rangeMatch[5].trim()
            };
        }

        // 単一日のパターン: "月/日/タイトル"
        const singlePattern = /^(\d{1,2})\/(\d{1,2})\/(.+)$/;
        const singleMatch = trimmed.match(singlePattern);

        if (singleMatch) {
            return {
                type: 'single',
                month: singleMatch[1],
                day: singleMatch[2],
                title: singleMatch[3].trim()
            };
        }

        return null;
    }

    // ===== カレンダー操作関数 =====
    async function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function waitForElement(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const intervalTime = 100;
            let elapsedTime = 0;
            const interval = setInterval(() => {
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
        for (const button of buttons) {
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
            for (const selector of selectors) {
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
     * 色を設定する関数（日付設定直後に実行）
     */
    async function setEventColor() {
        if (!selectedColor) {
            log("色が選択されていません。デフォルトの色を使用します。", "info");
            return false;
        }

        try {
            log(`色設定を開始: ${selectedColor}`, "info");

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
            const colorElement = document.querySelector(`[data-color="${selectedColor}"]`);
            if (!colorElement) {
                throw new Error(`指定された色の要素が見つかりません: ${selectedColor}`);
            }

            // 色をクリック
            colorElement.click();
            log(`色を設定しました: ${selectedColor}`, "success");
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
     * シンプルな日付設定関数 - エンターキーのみを使用
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
     * メインのイベント作成フロー
     */
    async function createEvent(parsedData) {
        try {
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

            // 5. 日付をシンプルな方法で設定 + 色設定
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

            // 6. 色設定
            await setEventColor();

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

        // ログエリアの表示切り替え
        if (isCompactMode && logContainer.parentNode === mainContainer) {
            mainContainer.removeChild(logContainer);
        } else if (!isCompactMode && !logContainer.parentNode) {
            mainContainer.appendChild(logContainer);
        }

        log(`表示モードを${isCompactMode ? 'コンパクト' : '標準'}に切り替え`, 'info');
    });

    // 初期化完了
    log('スクリプト v1.2.0 が初期化されました', 'success');
    log('作者: ホタル', 'info');
    log('シンプルなエンターキー方式で日付設定', 'info');
    log('入力例: "11/23/会議" または "11/2-11/5/ハロウィン"', 'info');
})();
