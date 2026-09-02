export type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: 'admin' | 'uploader';
  status: UserStatus;
  applicationNote: string | null;
  createdAt: number;
  approvedAt: number | null;
  lastLoginAt: number | null;
};

export type CollectionItem = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  ownerName: string;
  mediaCount: number;
  coverUrl: string | null;
  createdAt: number;
  updatedAt: number;
};

export type MediaItem = {
  id: string;
  name: string;
  type: 'image' | 'video';
  contentType: string;
  size: number;
  uploaderId: string | null;
  uploaderName: string | null;
  collectionId: string | null;
  collectionName: string | null;
  createdAt: number;
  url: string;
};
