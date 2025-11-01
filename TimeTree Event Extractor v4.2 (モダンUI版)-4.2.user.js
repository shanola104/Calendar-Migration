// ==UserScript==
// @name         TimeTree Event Extractor v4.2 (モダンUI版)
// @namespace    http://tampermonkey.net/
// @version      4.2
// @description  TimeTreeのマンスリーカレンダーから予定を抽出し、正確な日付確認機能付きでGoogleカレンダー用形式で出力します
// @author       Gemini
// @match        https://timetreeapp.com/calendars/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- Googleカレンダー自動入力スクリプト完全対応カラーマップ ---
    const colorMap = {
        '#d50000': 'トマト',
        '#e67c73': 'フラミンゴ',
        '#f4511e': 'ミカン',
        '#f6bf26': 'バナナ',
        '#33b679': 'セージ',
        '#0b8043': 'バジル',
        '#039be5': 'ピーコック',
        '#3f51b5': 'ブルーベリー',
        '#7986cb': 'ラベンダー',
        '#8e24aa': 'グレープ',
        '#616161': 'グラファイト',
        '#c0ca33': 'デフォルト',
        '#3dc2c8': 'ピーコック',
        '#2ecc87': 'セージ',
        '#47b2f7': 'ピーコック',
        '#948078': 'グラファイト',
        '#b38bdc': 'ラベンダー',
        '#f35f8c': 'フラミンゴ',
        '#fdc02d': 'バナナ',
        '#e73b3b': 'トマト',
        '#fb7f77': 'フラミンゴ',
        '#212121': 'グラファイト',
        '#8f8f8f': 'グラファイト',
        '#ffffff': 'デフォルト',
        '#000000': 'グラファイト'
    };

    // --- 色変換関数 ---
    function hexToRgb(hex) {
        if (!hex || typeof hex !== 'string') return { r: 0, g: 0, b: 0 };

        let cleanHex = hex.replace('#', '').toLowerCase();

        if (cleanHex.length === 3) {
            cleanHex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
        }

        if (cleanHex.length !== 6) return { r: 0, g: 0, b: 0 };

        const r = parseInt(cleanHex.substring(0, 2), 16);
        const g = parseInt(cleanHex.substring(2, 4), 16);
        const b = parseInt(cleanHex.substring(4, 6), 16);

        return { r, g, b };
    }

    function colorDistance(rgb1, rgb2) {
        const rDiff = rgb1.r - rgb2.r;
        const gDiff = rgb1.g - rgb2.g;
        const bDiff = rgb1.b - rgb2.b;
        return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
    }

    const colorMapRgbCache = {};
    for (const hex in colorMap) {
        colorMapRgbCache[hex] = hexToRgb(hex);
    }

    function findClosestColorName(targetHex) {
        if (!targetHex) return 'デフォルト';

        const normalizedTargetHex = targetHex.toLowerCase();

        if (colorMap[normalizedTargetHex]) {
            return colorMap[normalizedTargetHex];
        }

        const targetRgb = hexToRgb(normalizedTargetHex);
        let minDistance = Infinity;
        let closestName = 'デフォルト';

        for (const baseHex in colorMapRgbCache) {
            const baseRgb = colorMapRgbCache[baseHex];
            const distance = colorDistance(targetRgb, baseRgb);

            if (distance < minDistance) {
                minDistance = distance;
                closestName = colorMap[baseHex];
            }
        }

        console.log(`🎨 色変換: ${targetHex} → ${closestName} (差: ${minDistance.toFixed(2)})`);
        return closestName;
    }

    // --- 日付マッピングの改善関数 ---
    function createAccurateDateMap() {
        const timeEl = document.querySelector('time[datetime]');
        if (!timeEl) {
            throw new Error('カレンダーの年月要素が見つかりません。');
        }

        const yearStr = timeEl.textContent.split('年')[0];
        const currentYear = parseInt(yearStr, 10);
        const currentMonth = parseInt(timeEl.textContent.split('年')[1].split('月')[0]);

        const gridCells = document.querySelectorAll('[data-test-id="monthly-calendar"] [role="gridcell"]');
        if (gridCells.length === 0) {
            throw new Error('カレンダーグリッドが見つかりません。');
        }

        const dateMap = [];
        let year = currentYear;
        let month = currentMonth;

        // 最初のセルの日付をチェックして前月か判定
        const firstDay = parseInt(gridCells[0].querySelector('.css-c5ucje').textContent.trim(), 10);
        if (firstDay > 1) {
            // 前月の日付を含む場合
            if (currentMonth === 1) {
                month = 12;
                year = currentYear - 1;
            } else {
                month = currentMonth - 1;
            }
        }

        for (let i = 0; i < gridCells.length; i++) {
            const cell = gridCells[i];
            const dayElement = cell.querySelector('.css-c5ucje');
            if (!dayElement) continue;

            const day = parseInt(dayElement.textContent.trim(), 10);

            // 月の変わり目を検出（1日が見つかったら月を進める）
            if (i > 0 && day === 1) {
                if (month === 12) {
                    month = 1;
                    year += 1;
                } else {
                    month += 1;
                }
            }

            dateMap.push({
                year: year,
                month: month,
                day: day,
                element: cell
            });
        }

        return dateMap;
    }

    // --- 予定の詳細情報から正確な日付を取得する関数（修正版） ---
    async function getExactEventDate(eventButton) {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 20;

            console.log("🔍 詳細パネルの検索を開始します...");

            const checkForDetails = () => {
                attempts++;
                console.log(`🔍 詳細パネル検索試行 ${attempts}/${maxAttempts}`);

                // 詳細パネルを探す
                const detailPanel = document.querySelector('[data-test-id="event-detail"], .pyl1l31, [class*="event-detail"]');

                if (detailPanel) {
                    console.log("✅ 詳細パネルを発見");

                    // 日付要素を探す
                    let dateElement = detailPanel.querySelector('._1dctrbe2, ._818y5c4, [class*="date"], h2');

                    if (dateElement) {
                        console.log("✅ 日付要素を発見");
                        const dateText = dateElement.textContent.trim();
                        console.log("📅 日付テキスト:", dateText);

                        // 複数の日付形式をパース
                        const yearMatch = dateText.match(/(\d{4})年/);
                        const monthMatch = dateText.match(/(\d{1,2})月/);
                        const dayMatch = dateText.match(/(\d{1,2})日/);

                        if (yearMatch && monthMatch && dayMatch) {
                            const year = parseInt(yearMatch[1]);
                            const month = parseInt(monthMatch[1]);
                            const day = parseInt(dayMatch[1]);

                            console.log(`📅 解析結果: ${year}年${month}月${day}日`);

                            const startDate = new Date(year, month - 1, day);

                            // 終了日のチェック（期間指定の場合）
                            let endDate = startDate;
                            const dateRangeMatch = dateText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日[^]*?(\d{4})年(\d{1,2})月(\d{1,2})日/);
                            if (dateRangeMatch) {
                                const endYear = parseInt(dateRangeMatch[4]);
                                const endMonth = parseInt(dateRangeMatch[5]);
                                const endDay = parseInt(dateRangeMatch[6]);
                                endDate = new Date(endYear, endMonth - 1, endDay);
                                console.log(`📅 期間指定を検出: 終了日 ${endYear}年${endMonth}月${endDay}日`);
                            }

                            // 詳細パネルを閉じる - 修正: 正しい閉じるボタンを選択
                            setTimeout(() => {
                                closeDetailPanel();
                                setTimeout(() => {
                                    resolve({
                                        startDate: startDate,
                                        endDate: endDate
                                    });
                                }, 300);
                            }, 500);

                            return;
                        } else {
                            console.log("❌ 日付の解析に失敗");
                        }
                    } else {
                        console.log("❌ 日付要素が見つかりません");
                        // 代替方法: 詳細パネル内のすべてのテキストから日付を探す
                        const allText = detailPanel.textContent;

                        const yearMatch = allText.match(/(\d{4})年/);
                        const monthMatch = allText.match(/(\d{1,2})月/);
                        const dayMatch = allText.match(/(\d{1,2})日/);

                        if (yearMatch && monthMatch && dayMatch) {
                            const year = parseInt(yearMatch[1]);
                            const month = parseInt(monthMatch[1]);
                            const day = parseInt(dayMatch[1]);

                            console.log(`📅 代替方法で解析: ${year}年${month}月${day}日`);

                            const startDate = new Date(year, month - 1, day);

                            setTimeout(() => {
                                closeDetailPanel();
                                setTimeout(() => {
                                    resolve({
                                        startDate: startDate,
                                        endDate: startDate
                                    });
                                }, 300);
                            }, 500);
                            return;
                        }
                    }
                } else {
                    console.log("❌ 詳細パネルが見つかりません");
                }

                if (attempts < maxAttempts) {
                    setTimeout(checkForDetails, 200);
                } else {
                    console.log("❌ 最大試行回数に達しました");
                    reject(new Error('詳細情報の取得に失敗しました'));
                }
            };

            // 詳細パネルを閉じる関数 - 修正: 正しい閉じるボタンを選択
            function closeDetailPanel() {
                console.log("🚪 詳細パネルを閉じます");

                // 正しい閉じるボタンを選択 - aria-label="閉じる" かつ ×アイコンのボタン
                const closeButtons = document.querySelectorAll('button[aria-label="閉じる"]');
                let correctCloseButton = null;

                for (const button of closeButtons) {
                    // ×アイコンを含むボタンを探す
                    const svgPath = button.querySelector('path');
                    if (svgPath && svgPath.getAttribute('d').includes('5.3079912')) {
                        correctCloseButton = button;
                        break;
                    }
                }

                if (correctCloseButton) {
                    console.log("✅ 正しい閉じるボタンを発見、クリックします");
                    correctCloseButton.click();
                } else {
                    // 代替方法: ESCキーを送信
                    console.log("⚠️ 閉じるボタンが見つからないためESCキーを送信");
                    const escEvent = new KeyboardEvent('keydown', {
                        key: 'Escape',
                        code: 'Escape',
                        keyCode: 27,
                        which: 27,
                        bubbles: true
                    });
                    document.dispatchEvent(escEvent);
                }
            }

            // イベントボタンをクリック
            console.log("🖱️ イベントボタンをクリックします");
            eventButton.click();
            setTimeout(checkForDetails, 800);
        });
    }

    // --- モダンなUIスタイル ---
    GM_addStyle(`
        :root {
            --tt-primary: #6366f1;
            --tt-primary-hover: #4f46e5;
            --tt-secondary: #f8fafc;
            --tt-secondary-hover: #f1f5f9;
            --tt-surface: #ffffff;
            --tt-background: #f8fafc;
            --tt-border: #e2e8f0;
            --tt-text-primary: #1e293b;
            --tt-text-secondary: #64748b;
            --tt-text-muted: #94a3b8;
            --tt-success: #10b981;
            --tt-warning: #f59e0b;
            --tt-error: #ef4444;
            --tt-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
            --tt-shadow-lg: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --tt-primary: #818cf8;
                --tt-primary-hover: #6366f1;
                --tt-secondary: #334155;
                --tt-secondary-hover: #475569;
                --tt-surface: #1e293b;
                --tt-background: #0f172a;
                --tt-border: #334155;
                --tt-text-primary: #f1f5f9;
                --tt-text-secondary: #cbd5e1;
                --tt-text-muted: #64748b;
            }
        }

        #tt-extractor-panel {
            position: fixed;
            bottom: 25px;
            right: 25px;
            z-index: 9999;
            width: 480px;
            background: var(--tt-surface);
            border: 1px solid var(--tt-border);
            border-radius: 16px;
            box-shadow: var(--tt-shadow-lg);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
            backdrop-filter: blur(10px);
        }

        #tt-extractor-panel * {
            box-sizing: border-box;
        }

        #tt-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 24px;
            background: linear-gradient(135deg, var(--tt-primary), #8b5cf6);
            color: white;
            position: relative;
            overflow: hidden;
        }

        #tt-header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(45deg, transparent, rgba(255,255,255,0.1), transparent);
            transform: translateX(-100%);
            animation: shimmer 3s infinite;
        }

        @keyframes shimmer {
            100% { transform: translateX(100%); }
        }

        #tt-header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            position: relative;
            z-index: 2;
        }

        #tt-title {
            font-weight: 700;
            font-size: 18px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        #tt-status {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            background: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.3);
        }

        #tt-scanner-animation {
            display: none;
            width: 100%;
            height: 3px;
            background: linear-gradient(90deg, var(--tt-primary), #8b5cf6, var(--tt-primary));
            position: relative;
            overflow: hidden;
        }
        #tt-scanner-animation.scanning {
            display: block;
        }
        .tt-scan-line {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent);
            animation: tt-scan-anim 1.5s infinite linear;
        }
        @keyframes tt-scan-anim {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        .tt-progress {
            margin: 0 24px 20px 24px;
            background: var(--tt-secondary);
            border-radius: 12px;
            padding: 16px;
            font-size: 13px;
            color: var(--tt-text-primary);
            display: none;
            border: 1px solid var(--tt-border);
        }
        .tt-progress.active {
            display: block;
        }
        .tt-progress-bar {
            height: 6px;
            background: var(--tt-border);
            border-radius: 3px;
            overflow: hidden;
            margin: 12px 0 8px 0;
        }
        .tt-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--tt-primary), #8b5cf6);
            border-radius: 3px;
            transition: width 0.3s ease;
            width: 0%;
            position: relative;
            overflow: hidden;
        }
        .tt-progress-fill::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            bottom: 0;
            right: 0;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
            animation: progressShine 2s infinite;
        }
        @keyframes progressShine {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        #tt-controls {
            display: flex;
            gap: 12px;
            padding: 20px 24px;
            flex-wrap: wrap;
        }
        #tt-controls button {
            flex: 1;
            border: none;
            padding: 14px 20px;
            border-radius: 12px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            min-width: 160px;
            position: relative;
            overflow: hidden;
        }
        #tt-controls button::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(45deg, transparent, rgba(255,255,255,0.1), transparent);
            transform: translateX(-100%);
            transition: transform 0.6s;
        }
        #tt-controls button:hover::before {
            transform: translateX(100%);
        }
        #tt-integrated-scan-btn {
            background: var(--tt-primary);
            color: white;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }
        #tt-integrated-scan-btn:hover {
            background: var(--tt-primary-hover);
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4);
        }
        #tt-copy-btn {
            background: var(--tt-secondary);
            color: var(--tt-text-primary);
            border: 1px solid var(--tt-border);
        }
        #tt-copy-btn:hover {
            background: var(--tt-secondary-hover);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        #tt-copy-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        #tt-copy-btn:disabled:hover::before {
            transform: translateX(-100%);
        }

        #tt-result-output {
            width: calc(100% - 48px);
            height: 200px;
            margin: 0 24px 20px 24px;
            border: 1px solid var(--tt-border);
            border-radius: 12px;
            padding: 16px;
            font-size: 13px;
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
            resize: vertical;
            background: var(--tt-surface);
            color: var(--tt-text-primary);
            min-height: 120px;
            transition: all 0.2s ease;
            line-height: 1.5;
        }
        #tt-result-output:focus {
            outline: none;
            border-color: var(--tt-primary);
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
        #tt-result-output::placeholder {
            color: var(--tt-text-muted);
        }

        .tt-log-area {
            margin: 0 24px 20px 24px;
            padding: 16px;
            background: var(--tt-secondary);
            border: 1px solid var(--tt-border);
            border-radius: 12px;
            max-height: 140px;
            overflow-y: auto;
            font-size: 12px;
            color: var(--tt-text-secondary);
            display: none;
        }
        .tt-log-area.active {
            display: block;
        }
        .tt-log-header {
            font-weight: 700;
            margin-bottom: 12px;
            color: var(--tt-text-primary);
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .tt-log-content {
            max-height: 100px;
            overflow-y: auto;
        }
        .tt-log-entry {
            margin-bottom: 6px;
            padding: 4px 0;
            border-bottom: 1px solid var(--tt-border);
            display: flex;
            align-items: flex-start;
            gap: 8px;
        }
        .tt-log-time {
            color: var(--tt-text-muted);
            font-size: 10px;
            min-width: 50px;
            flex-shrink: 0;
        }
        .tt-log-message {
            flex: 1;
            word-break: break-word;
        }

        /* スクロールバーのスタイル */
        .tt-log-content::-webkit-scrollbar {
            width: 4px;
        }
        .tt-log-content::-webkit-scrollbar-track {
            background: var(--tt-border);
            border-radius: 2px;
        }
        .tt-log-content::-webkit-scrollbar-thumb {
            background: var(--tt-text-muted);
            border-radius: 2px;
        }
        .tt-log-content::-webkit-scrollbar-thumb:hover {
            background: var(--tt-text-secondary);
        }

        /* ドラッグ可能にする */
        #tt-extractor-panel {
            cursor: move;
        }
        #tt-extractor-panel:active {
            cursor: grabbing;
        }
    `);

    // --- UIの作成 ---
    const panel = document.createElement('div');
    panel.id = 'tt-extractor-panel';
    panel.innerHTML = `
        <div id="tt-header">
            <div id="tt-header-content">
                <div id="tt-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 7V3M16 7V3M7 11H17M5 21H19C20.1046 21 21 20.1046 21 19V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7V19C3 20.1046 3.89543 21 5 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    TimeTree Extractor
                </div>
                <div id="tt-status" class="idle">準備完了</div>
            </div>
        </div>
        <div id="tt-scanner-animation">
            <div class="tt-scan-line"></div>
        </div>
        <div class="tt-progress">
            <div class="tt-progress-text">準備中...</div>
            <div class="tt-progress-bar">
                <div class="tt-progress-fill"></div>
            </div>
        </div>
        <div id="tt-controls">
            <button id="tt-integrated-scan-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                統合スキャン実行
            </button>
            <button id="tt-copy-btn" disabled>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 4H16C17.1046 4 18 4.89543 18 6V14C18 15.1046 17.1046 16 16 16H8C6.89543 16 6 15.1046 6 14V6C6 4.89543 6.89543 4 8 4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M16 20H6C4.89543 20 4 19.1046 4 18V8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                結果をコピー
            </button>
        </div>
        <textarea id="tt-result-output" readonly placeholder="「統合スキャン実行」ボタンを押して、高精度な予定抽出を開始します。"></textarea>
        <div class="tt-log-area" id="tt-log-area">
            <div class="tt-log-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                実行中のタスク
            </div>
            <div class="tt-log-content" id="tt-log-content"></div>
        </div>
    `;
    document.body.appendChild(panel);

    // --- UI要素を取得 ---
    const integratedScanBtn = document.getElementById('tt-integrated-scan-btn');
    const copyBtn = document.getElementById('tt-copy-btn');
    const resultOutput = document.getElementById('tt-result-output');
    const statusEl = document.getElementById('tt-status');
    const animEl = document.getElementById('tt-scanner-animation');
    const progressEl = document.querySelector('.tt-progress');
    const progressText = document.querySelector('.tt-progress-text');
    const progressFill = document.querySelector('.tt-progress-fill');
    const logArea = document.getElementById('tt-log-area');
    const logContent = document.getElementById('tt-log-content');

    let finalResultsText = "";

    // --- ドラッグ機能 ---
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    panel.addEventListener('mousedown', (e) => {
        if (e.target.closest('button') || e.target.closest('textarea')) {
            return;
        }
        isDragging = true;
        dragOffset.x = e.clientX - panel.getBoundingClientRect().left;
        dragOffset.y = e.clientY - panel.getBoundingClientRect().top;
        panel.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const x = e.clientX - dragOffset.x;
        const y = e.clientY - dragOffset.y;

        // 画面内に制限
        const maxX = window.innerWidth - panel.offsetWidth;
        const maxY = window.innerHeight - panel.offsetHeight;

        panel.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
        panel.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.position = 'fixed';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        panel.style.cursor = 'move';
    });

    // --- ヘルパー関数 ---
    function updateStatus(state, text) {
        statusEl.className = state;
        statusEl.textContent = text;
        animEl.classList.toggle('scanning', state === 'scanning');
        progressEl.classList.toggle('active', state === 'scanning');
        logArea.classList.toggle('active', state === 'scanning');
        integratedScanBtn.disabled = (state === 'scanning');
        copyBtn.disabled = (state !== 'success' || !finalResultsText);
    }

    function updateProgress(text, percent) {
        if (progressText) progressText.textContent = text;
        if (progressFill) progressFill.style.width = `${percent}%`;
    }

    function addLog(message) {
        const logEntry = document.createElement('div');
        logEntry.className = 'tt-log-entry';

        const timeElem = document.createElement('div');
        timeElem.className = 'tt-log-time';
        timeElem.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        const messageElem = document.createElement('div');
        messageElem.className = 'tt-log-message';
        messageElem.textContent = message;

        logEntry.appendChild(timeElem);
        logEntry.appendChild(messageElem);
        logContent.appendChild(logEntry);
        logContent.scrollTop = logContent.scrollHeight;
    }

    function formatDate(date) {
        return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    function isContinuous(date1, date2) {
        const nextDay = new Date(date1.getTime());
        nextDay.setDate(nextDay.getDate() + 1);
        return nextDay.getFullYear() === date2.getFullYear() &&
               nextDay.getMonth() === date2.getMonth() &&
               nextDay.getDate() === date2.getDate();
    }

    function log(message) {
        console.log(`[TimeTree Extractor] ${message}`);
        addLog(message);
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // --- 基本スキャン関数 ---
    function performBasicScan() {
        log('🔍 基本スキャンを開始します...');

        // 1. 正確な日付マップを作成
        const dateMap = createAccurateDateMap();
        log(`🗺️ 正確な日付マップを作成しました (${dateMap.length}セル)`);

        // 2. イベント要素をすべて取得
        const eventElements = document.querySelectorAll('[data-test-id="monthly-calendar"] .lndlxo5');
        log(`🔍 予定要素を ${eventElements.length} 件検出しました。`);

        let rawEvents = [];
        const processedElements = new Set();

        eventElements.forEach((el, index) => {
            if (processedElements.has(el)) return;
            processedElements.add(el);

            const style = el.style;
            const lndlxo2 = parseInt(style.getPropertyValue('--lndlxo2'), 10); // 列 (1-7)
            const lndlxo3 = parseInt(style.getPropertyValue('--lndlxo3'), 10); // 行
            const lndlxo4 = parseInt(style.getPropertyValue('--lndlxo4') || '1', 10); // 日数

            const button = el.querySelector('button');
            if (!button) return;

            const titleEl = button.querySelector('.lndlxo9');
            if (!titleEl) return;
            const title = titleEl.textContent.trim();

            // 色の抽出
            const buttonStyle = button.getAttribute('style') || '';
            let colorHex = '#8f8f8f';
            const colorMatch = buttonStyle.match(/--_1(?:r1c5vl0|bf4eeq0|foazdk0):\s*(#[0-9a-fA-F]{3,8})/);
            if (colorMatch && colorMatch[1]) {
                colorHex = colorMatch[1];
            }

            // 色名変換
            const colorName = findClosestColorName(colorHex);

            // 日付にマッピング - 改善された計算
            const weekIndex = Math.floor((lndlxo3 - 3) / 7);
            const colIndex = lndlxo2 - 1;
            const mapIndex = (weekIndex * 7) + colIndex;

            if (mapIndex < 0 || (mapIndex + lndlxo4 - 1) >= dateMap.length) {
                log(`⚠️ [${title}] の日付特定に失敗しました (範囲外: ${mapIndex})`);
                return;
            }

            const startDateInfo = dateMap[mapIndex];
            const endDateInfo = dateMap[mapIndex + lndlxo4 - 1];

            const startDate = new Date(startDateInfo.year, startDateInfo.month - 1, startDateInfo.day);
            const endDate = new Date(endDateInfo.year, endDateInfo.month - 1, endDateInfo.day);

            rawEvents.push({
                title,
                colorName,
                startDate,
                endDate,
                element: el,
                button: button,
                verified: false // 基本スキャンでは未確認
            });
        });

        log(`🧩 基本スキャンで抽出した予定: ${rawEvents.length} 件`);

        // 3. 予定の統合処理
        const groupedEvents = new Map();
        rawEvents.forEach(event => {
            const key = `${event.title}|${event.colorName}`;
            if (!groupedEvents.has(key)) {
                groupedEvents.set(key, []);
            }
            groupedEvents.get(key).push(event);
        });

        log(`🤝 統合対象のグループ: ${groupedEvents.size} 件`);

        const finalEvents = [];
        groupedEvents.forEach((eventsInGroup, key) => {
            eventsInGroup.sort((a, b) => a.startDate - b.startDate);

            if (eventsInGroup.length === 0) return;

            let currentMergedEvent = { ...eventsInGroup[0] };

            for (let i = 1; i < eventsInGroup.length; i++) {
                const nextEvent = eventsInGroup[i];
                if (isContinuous(currentMergedEvent.endDate, nextEvent.startDate)) {
                    currentMergedEvent.endDate = nextEvent.endDate;
                    log(`🔗 [${currentMergedEvent.title}] の予定を統合しました。`);
                } else {
                    finalEvents.push(currentMergedEvent);
                    currentMergedEvent = { ...nextEvent };
                }
            }
            finalEvents.push(currentMergedEvent);
        });

        // 4. 最終結果を日付順にソート
        finalEvents.sort((a, b) => a.startDate - b.startDate);

        log(`✅ 基本スキャン完了: ${finalEvents.length} 件の予定を抽出`);

        return finalEvents;
    }

    // --- 詳細確認スキャン関数（改善版） ---
    async function performDetailedVerification(basicEvents) {
        log('🔍 詳細確認を開始します...');

        const verifiedEvents = [];
        let successCount = 0;
        let errorCount = 0;

        // 基本スキャンの結果を元に詳細確認
        for (let i = 0; i < basicEvents.length; i++) {
            const basicEvent = basicEvents[i];

            updateProgress(`詳細確認中: ${basicEvent.title} (${i+1}/${basicEvents.length})`, (i / basicEvents.length) * 70 + 20);

            try {
                // 対応するボタンを探す
                const eventElements = document.querySelectorAll('[data-test-id="monthly-calendar"] .lndlxo5');
                let targetButton = null;

                for (const el of eventElements) {
                    const button = el.querySelector('button');
                    if (button) {
                        const titleEl = button.querySelector('.lndlxo9');
                        if (titleEl && titleEl.textContent.trim() === basicEvent.title) {
                            targetButton = button;
                            break;
                        }
                    }
                }

                if (targetButton) {
                    log(`🔍 [${basicEvent.title}] の詳細確認を開始`);
                    const exactDates = await getExactEventDate(targetButton);

                    verifiedEvents.push({
                        title: basicEvent.title,
                        colorName: basicEvent.colorName,
                        startDate: exactDates.startDate,
                        endDate: exactDates.endDate,
                        verified: true
                    });

                    log(`✅ [${basicEvent.title}] の日付を確認: ${formatDate(exactDates.startDate)}${exactDates.startDate.getTime() !== exactDates.endDate.getTime() ? `-${formatDate(exactDates.endDate)}` : ''}`);
                    successCount++;

                    // 次のイベントまでの待機
                    await wait(1000);
                } else {
                    log(`⚠️ [${basicEvent.title}] の対応するボタンが見つかりません`);
                    // 見つからない場合は基本スキャンの結果を使用
                    verifiedEvents.push(basicEvent);
                    errorCount++;
                }

            } catch (error) {
                log(`❌ [${basicEvent.title}] の詳細確認に失敗: ${error.message}`);
                // 失敗した場合は基本スキャンの結果を使用
                verifiedEvents.push(basicEvent);
                errorCount++;
            }
        }

        log(`📊 詳細確認結果: ${successCount}成功, ${errorCount}失敗/未確認`);

        return verifiedEvents;
    }

    // --- 統合スキャン関数 ---
    async function performIntegratedScan() {
        finalResultsText = "";
        resultOutput.value = '';
        logContent.innerHTML = '';
        updateStatus('scanning', '統合スキャン実行中...');

        try {
            // ステップ1: 基本スキャン
            updateProgress('基本スキャンを実行中...', 10);
            const basicEvents = performBasicScan();

            if (basicEvents.length === 0) {
                resultOutput.value = '基本スキャンで予定が見つかりませんでした。';
                updateStatus('idle', '0件');
                return;
            }

            // ステップ2: 詳細確認
            updateProgress('詳細確認を実行中...', 20);
            const verifiedEvents = await performDetailedVerification(basicEvents);

            // ステップ3: 最終結果を日付順にソート
            updateProgress('結果を整理中...', 90);
            verifiedEvents.sort((a, b) => a.startDate - b.startDate);

            // ステップ4: 出力文字列を作成
            const outputLines = verifiedEvents.map(event => {
                const startDateStr = formatDate(event.startDate);
                const endDateStr = formatDate(event.endDate);

                const dateString = (event.startDate.getTime() === event.endDate.getTime())
                    ? startDateStr
                    : `${startDateStr}-${endDateStr}`;

                return `${dateString}/${event.title}/${event.colorName}`;
            });

            finalResultsText = outputLines.join('\n');

            // 結果表示
            resultOutput.value = finalResultsText;
            updateStatus('success', `完了 (${verifiedEvents.length}件)`);
            log(`🎉 統合スキャン完了！ ${verifiedEvents.length} 件の予定を高精度で抽出しました。`);

        } catch (e) {
            console.error('TimeTree Extractor Error:', e);
            log(`🔥 統合スキャンエラー: ${e.message}`);
            updateStatus('error', 'エラー');
            resultOutput.value = `統合スキャン中にエラーが発生しました。\n詳細はコンソール（F12）を確認してください。\n\n${e.message}`;
        }
    }

    // --- クリップボードにコピー ---
    function copyResultsToClipboard() {
        if (!finalResultsText) return;

        GM_setClipboard(finalResultsText);

        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 13L9 17L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            コピー済み!
        `;
        updateStatus('success', 'コピー済み!');
        log('📋 結果をクリップボードにコピーしました。');

        setTimeout(() => {
            copyBtn.innerHTML = originalText;
            updateStatus('success', `完了 (${finalResultsText.split('\n').length}件)`);
        }, 2000);
    }

    // --- イベントリスナーを設定 ---
    integratedScanBtn.addEventListener('click', performIntegratedScan);
    copyBtn.addEventListener('click', copyResultsToClipboard);

    log('🟩 TimeTree Extractor v4.2 (モダンUI版) が起動しました。');

})();