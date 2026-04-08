<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>顧德補習班 - 家長分潤系統</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f0f2f5;
            margin: 0;
            padding: 20px;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 { color: #1a365d; margin-bottom: 5px; font-size: 28px;}
        .header p { color: #718096; margin-top: 0; }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 8px 16px rgba(0,0,0,0.05);
        }
        
        .calculator-section {
            background: #f8fafc;
            padding: 25px;
            border-radius: 10px;
            border: 1px solid #e2e8f0;
            border-left: 6px solid #3182ce;
        }
        
        .input-group { margin-bottom: 20px; }
        .input-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #4a5568;
        }
        .input-group input {
            width: 100%;
            padding: 12px;
            border: 1px solid #cbd5e0;
            border-radius: 6px;
            box-sizing: border-box;
            font-size: 16px;
        }
        
        button {
            background-color: #dd6b20;
            color: white;
            border: none;
            padding: 15px 20px;
            font-size: 18px;
            border-radius: 6px;
            cursor: pointer;
            width: 100%;
            font-weight: bold;
            transition: 0.2s;
        }
        button:hover { background-color: #c05621; }
        
        #resultBox {
            margin-top: 20px;
            padding: 20px;
            background: #ebf8ff;
            border: 1px dashed #63b3ed;
            border-radius: 8px;
            text-align: center;
            font-size: 1.2em;
            display: none;
        }
        .highlight { color: #e53e3e; font-weight: bold; font-size: 1.6em; display: block; margin-top: 10px;}
        .stage-badge {
            background: #2b6cb0;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.9em;
        }
    </style>
</head>
<body>

<div class="container">
    <div class="header">
        <h1>🏫 顧德補習班</h1>
        <p>家長專屬推薦分潤系統 - 測試機</p>
    </div>
    
    <div class="calculator-section">
        <h3 style="margin-top: 0;">🧮 獎金試算工具 (10% ➔ 6% ➔ 4%)</h3>
        <p style="color: #718096; font-size: 0.95em;">輸入學生報名日與學費，系統將自動判定年資並結算該發放的獎金。</p>
        
        <div class="input-group">
            <label for="enrollDate">📅 該名學生首次報名日期：</label>
            <input type="date" id="enrollDate" value="2024-01-01">
        </div>
        
        <div class="input-group">
            <label for="tuitionAmount">💰 本次繳納學費 (NT$)：</label>
            <input type="number" id="tuitionAmount" value="30000" placeholder="例如：30000">
        </div>

        <button onclick="runCalculator()">立即計算分潤獎金</button>

        <div id="resultBox"></div>
    </div>
</div>

<script>
    function calculateCommission(enrollDateString, tuitionAmount) {
        const today = new Date(); 
        const enrollDate = new Date(enrollDateString); 
        
        const diffTime = Math.abs(today - enrollDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const yearsEnrolled = diffDays / 365;

        let rate = 0;
        let stageName = "";

        if (yearsEnrolled <= 1) {
            rate = 0.10;
            stageName = "第一年 (10%)";
        } else if (yearsEnrolled <= 2) {
            rate = 0.06;
            stageName = "第二年 (6%)";
        } else {
            rate = 0.04;
            stageName = "第三年起 (4%)";
        }

        return {
            stage: stageName,
            amount: Math.floor(tuitionAmount * rate)
        };
    }

    function runCalculator() {
        const dateInput = document.getElementById('enrollDate').value;
        const amountInput = document.getElementById('tuitionAmount').value;

        if (!dateInput || !amountInput) {
            alert("請完整填寫日期與金額！");
            return;
        }

        const result = calculateCommission(dateInput, amountInput);
        const resultBox = document.getElementById('resultBox');
        
        resultBox.style.display = 'block'; 
        resultBox.innerHTML = `
            目前的年資適用標準： <span class="stage-badge">${result.stage}</span><br>
            系統核算應發放獎金：<span class="highlight">NT$ ${result.amount.toLocaleString()}</span>
        `;
    }
</script>

</body>
</html>
