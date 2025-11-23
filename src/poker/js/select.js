

class Character{
    constructor(number, img, name, parsonality, type, hp, attack, difence, speed, intelogence)
    {
        this.number = number;
        this.img = img;
        this.name = name;
        this.parsonality = parsonality;
        this.type = type;
        this.hp = hp;
        this.attack = attack;
        this.difence = difence;
        this.speed = speed;
        this.intelogence = intelogence;
    }
    }
    

let character_set = [];

    character_set [0] = new Character(0, "images/キャラクター画像/benkei.png", "武蔵坊 弁慶", "まじめ", "攻撃型", "B", "B", "C", "C", "C");
    character_set [1] = new Character(1, "images/キャラクター画像/date_masamune.png", "伊達 政宗", "狡猾", "守備型", "C", "C", "A", "A", "B");
    character_set [2] = new Character(2, "images/キャラクター画像/ishida_mitsunari.png", "石田 三成", "まじめ", "守備型", "C", "C", "C", "A", "C");
    character_set [3] = new Character(3, "images/キャラクター画像/miyamoto_musashi.png", "宮本 武蔵", "熱血", "攻撃型", "B", "A", "C", "B", "C");
    character_set [4] = new Character(4, "images/キャラクター画像/nigaoe_akechi_mitsuhide.png", "明智 光秀", "狡猾", "守備型", "C", "C", "A", "C", "B");
    character_set [5] = new Character(5, "images/キャラクター画像/nigaoe_taikoubou.png", "太公望", "狡猾", "守備型", "C", "C", "B", "C", "A");
    character_set [6] = new Character(6, "images/キャラクター画像/nigaoe_buou_syuu.png", "武王", "まじめ", "攻撃型", "C", "C", "B", "C", "C");
    character_set [7] = new Character(7, "images/キャラクター画像/nigaoe_chingisuhan.png", "チンギス ハーン", "狡猾", "守備型", "A", "B", "B", "B", "B");
character_set[8] = new Character(8, "images/キャラクター画像/nigaoe_chouhi.png", "張飛", "まじめ", "守備型", "A", "A", "C", "C", "C");
    
character_set[9] = new Character(9, "images/キャラクター画像/nigaoe_daruma_taishi.png", "達磨大師", "熱血", "攻撃型", "C", "C", "C", "A", "C");
    
character_set[10] = new Character(10, "images/キャラクター画像/nigaoe_hattori_hanzou.png", "服部 半蔵", "狡猾", "守備型", "C", "C", "C", "A", "C");
    
    character_set [11] = new Character(11, "images/キャラクター画像/nigaoe_hondatadakatsu.png", "本多 忠勝", "狡猾", "守備型", "A", "A", "A", "B", "C");
    character_set [12] = new Character(12, "images/キャラクター画像/nigaoe_sonken.png", "孫権", "まじめ", "攻撃型", "C", "C", "C", "B", "B");
    character_set [13] = new Character(13, "images/キャラクター画像/nigaoe_ishikawa_goemon.png", "石川 五右衛門", "狡猾", "守備型", "A", "B", "C", "C", "C");
    character_set [14] = new Character(14, "images/キャラクター画像/nigaoe_kanu.png", "関羽", "まじめ", "守備型", "A", "A", "B", "C", "C");
    character_set [15] = new Character(15, "images/キャラクター画像/nigaoe_shikoutei.png", "始皇帝", "熱血", "攻撃型", "C", "C", "B", "C", "A");
    character_set [16] = new Character(16, "images/キャラクター画像/nigaoe_shibata_katsuie.png", "柴田 勝家", "狡猾", "守備型", "B", "B", "C", "C", "C");
    character_set [17] = new Character(17, "images/キャラクター画像/nigaoe_saitou_dousan.png", "斎藤 道三", "狡猾", "守備型", "C", "C", "C", "C", "B");
    character_set [18] = new Character(18, "images/キャラクター画像/nigaoe_mori_tomonobu.png", "母里 友信", "まじめ", "攻撃型", "B", "B", "C", "C", "C");
    character_set [19] = new Character(19, "images/キャラクター画像/nigaoe_koushi.png", "孔子", "狡猾", "守備型", "C", "C", "B", "C", "B");
    character_set [20] = new Character(20, "images/キャラクター画像/nigaoe_katoukiyomasa.png", "加藤 清正", "まじめ", "守備型", "B", "B", "C", "C", "C");
    character_set [21] = new Character(21, "images/キャラクター画像/uesugi_kenshin.png", "上杉 謙信", "熱血", "攻撃型", "B", "A", "B", "B", "B");
    character_set [22] = new Character(22, "images/キャラクター画像/takeda_shingen.png", "武田 信玄", "狡猾", "守備型", "B", "B", "A", "B", "B");
    character_set [23] = new Character(23, "images/キャラクター画像/sousou.png", "曹操", "狡猾", "守備型", "C", "C", "A", "B", "B");
    character_set [24] = new Character(24, "images/キャラクター画像/sanada_yukimura.png", "真田 幸村", "まじめ", "攻撃型", "B", "B", "B", "A", "B");
    character_set [25] = new Character(25, "images/キャラクター画像/nigaoe_yagyuu_juubee.png", "柳生 十兵衛", "狡猾", "守備型", "B", "B", "C", "B", "C");
    character_set [26] = new Character(26, "images/キャラクター画像/nigaoe_syokatsu_koumei.png", "諸葛孔明", "まじめ", "守備型", "C", "C", "B", "C", "A");
    character_set [27] = new Character(27, "images/キャラクター画像/nigaoe_sonbu.png", "孫武", "熱血", "攻撃型", "C", "C", "C", "B", "A");
    character_set [28] = new Character(28, "images/キャラクター画像/nigaoe_sanada_masayuki.png", "真田 昌幸", "狡猾", "守備型", "C", "C", "B", "C", "A");
    character_set [29] = new Character(29, "images/キャラクター画像/nigaoe_ryuuzouji_takanobu.png", "龍造寺 隆信", "狡猾", "守備型", "B", "B", "C", "C", "C");
    character_set [30] = new Character(30, "images/キャラクター画像/nigaoe_mito_mitsukuni_koumon2.png", "水戸黄門", "まじめ", "攻撃型", "C", "C", "C", "B", "B");
    character_set [31] = new Character(31, "images/キャラクター画像/nigaoe_kuroda_kanbei.png", "黒田 官兵衛", "直情型", "攻撃型", "B", "C", "B", "B", "C");

    export {Character, character_set}