<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>顧德補習班 - 家長分潤查詢後台</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f4f7f6;
            margin: 0;
            padding: 20px;
            color: #333;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }
        h2 { color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 15px; margin-top: 0;}
        
        /* 查詢區塊 */
        .search-box {
            background: #e8f4f8;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        select {
            padding: 10px;
            font-size: 16px;
            border-radius: 5px;
            border: 1px solid #ccc;
            flex-grow: 1;
        }
        button {
            background-color: #3498db;
            color: white;
            border: none;
            padding: 10px 20px;
            font-size: 16px;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
        }
        button:hover { background-color: #2980b9; }

        /* 總結卡片區塊 */
        .summary-cards {
            display: none; /* 一開始先隱藏 */
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }
        .card {
            padding: 20px;
            border-radius: 8px;
            color: white;
            text-align: center;
        }
        .card-blue { background: #34495e; }
        .card-orange { background: #e67e22; }
        .card h3 { margin: 0 0 10px 0; font-size: 1.2em; opacity: 0.9; }
        .card .amount { font-size: 2.5em; font-weight: bold; }

        /* 學生明細清單 */
        .detail-section { display: none; } /* 一開始先隱藏 */
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
            background: #fff;
        }
        th, td {
            padding: 12px 15px;
            border-bottom: 1px solid #eee;
            text-align: left;
        }
        th { background-color: #f8f9fa; color: #2c3e50; font-weight: bold; }
        tr:hover { background-color: #f5f5f5; }
        .badge {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.85em;
            color: white;
        }
        .badge.
