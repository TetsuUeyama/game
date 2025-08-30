import { Character } from '@/types/poker/PokerGameTypes'

export const characters: Character[] = [
  {
    id: 0,
    name: '武蔵坊 弁慶',
    personality: 'まじめ',
    type: 'attack',
    hp: 'B',
    attack: 'B',
    defense: 'C',
    speed: 'C',
    intelligence: 'C',
    image: '/poker/1.jpg'
  },
  {
    id: 1,
    name: '伊達 政宗',
    personality: '狡猾',
    type: 'defense',
    hp: 'C',
    attack: 'C',
    defense: 'A',
    speed: 'A',
    intelligence: 'B',
    image: '/poker/2.jpg'
  },
  {
    id: 2,
    name: '石田 三成',
    personality: 'まじめ',
    type: 'defense',
    hp: 'C',
    attack: 'C',
    defense: 'C',
    speed: 'A',
    intelligence: 'C',
    image: '/poker/3.jpg'
  },
  {
    id: 3,
    name: '宮本 武蔵',
    personality: '熱血',
    type: 'attack',
    hp: 'B',
    attack: 'A',
    defense: 'C',
    speed: 'B',
    intelligence: 'C',
    image: '/poker/4.jpg'
  },
  {
    id: 4,
    name: '明智 光秀',
    personality: '狡猾',
    type: 'defense',
    hp: 'C',
    attack: 'C',
    defense: 'A',
    speed: 'C',
    intelligence: 'B',
    image: '/poker/5.jpg'
  },
  {
    id: 5,
    name: '太公望',
    personality: '狡猾',
    type: 'defense',
    hp: 'C',
    attack: 'C',
    defense: 'B',
    speed: 'C',
    intelligence: 'A',
    image: '/poker/1.jpg'
  },
  {
    id: 6,
    name: '武王',
    personality: 'まじめ',
    type: 'attack',
    hp: 'C',
    attack: 'C',
    defense: 'B',
    speed: 'C',
    intelligence: 'C',
    image: '/poker/2.jpg'
  },
  {
    id: 7,
    name: 'チンギス ハーン',
    personality: '狡猾',
    type: 'defense',
    hp: 'A',
    attack: 'B',
    defense: 'B',
    speed: 'B',
    intelligence: 'B',
    image: '/poker/3.jpg'
  },
  {
    id: 8,
    name: '張飛',
    personality: 'まじめ',
    type: 'defense',
    hp: 'A',
    attack: 'A',
    defense: 'C',
    speed: 'C',
    intelligence: 'C',
    image: '/poker/4.jpg'
  },
  {
    id: 9,
    name: '達磨大師',
    personality: '熱血',
    type: 'attack',
    hp: 'C',
    attack: 'C',
    defense: 'C',
    speed: 'A',
    intelligence: 'C',
    image: '/poker/5.jpg'
  },
  {
    id: 21,
    name: '上杉 謙信',
    personality: '熱血',
    type: 'attack',
    hp: 'B',
    attack: 'A',
    defense: 'B',
    speed: 'B',
    intelligence: 'B',
    image: '/poker/1.jpg'
  },
  {
    id: 22,
    name: '武田 信玄',
    personality: '狡猾',
    type: 'defense',
    hp: 'B',
    attack: 'B',
    defense: 'A',
    speed: 'B',
    intelligence: 'B',
    image: '/poker/2.jpg'
  }
]

export const getCharacterById = (id: number): Character | undefined => {
  return characters.find(char => char.id === id)
}

export const getRandomCharacter = (): Character => {
  const randomIndex = Math.floor(Math.random() * characters.length)
  return characters[randomIndex]
}