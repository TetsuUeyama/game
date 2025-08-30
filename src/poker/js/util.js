/**
 * Utilクラス
 */

export default class Util{
    /**
     * 指定した時間だけ待つ(未指定の場合は1秒)
     */

    static sleep = (wait = 800) => {
        return new Promise((resolve, reject) => {
            setTimeout(() => resolve(), wait);
        });
    };

    /**
     * イベントハンドラを追加する
     */
    static addEventListener = (selector, event, handler) => {
        document.querySelectorAll(selector).forEach((e) => e.addEventListener(event, handler));
    };

    /**
     * 数値を合計する
     */
    static sum = (...numbers) => {
        let sum = 0;
        numbers.forEach((e) => {
            sum += e;
        });
        return sum;
    };

    
} 