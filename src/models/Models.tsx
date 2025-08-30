export type QuestionModal = {
  TotalPage: number,
  QuestionPage: number,
  QuestionStep: string, 
  QuestionTitle:  string, 
  QuestionText:  string, 
}
export type AnswerPageDataModal = {
  ReferencePage: number,
  ReferenceStep: string, 
  ReferenceTitle:  string, 
  ReferenceTextOne:  string, 
  ReferenceTextTwo:  string, 
  ReferenceTextThree:  string, 
}



export type UserEntry = {
  UserLastName: string,
  UserFirstName: string, 
  UserAddress:  string, 
  UserGender:  string, 
}
export type UserDataModal = {
  UserId: string,
  userInformation: UserEntry[],
  timestamp?: number,
}

export type AnswerEntry = {
  page: number;
  answer: string;
};

export type LayoutModel = {
  dataId: string,
  userInformation: UserDataModal[],
  answers: AnswerEntry[],
  timestamp?: number,
}
export type AnswerDataModel = {
  dataId: string,
  answers: AnswerEntry[],
  timestamp?: number,
}