export type ThreadId = string;

export type DMThread = {
  id: ThreadId;
  userAId: string;
  userBId: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadForA: number;
  unreadForB: number;
};

export type DMMessage = {
  id: string;
  threadId: ThreadId;
  fromUserId: string;
  text: string;
  createdAt: string;
};