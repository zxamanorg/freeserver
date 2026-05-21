export enum ClaimStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  USED = 'used'
}

export interface ClaimRequest {
  id: string;
  name: string;
  email: string;
  discordId: string;
  code: string;
  ipAddress: string;
  deviceFingerprint: string;
  status: ClaimStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLog {
  id: string;
  adminAction: string;
  targetCode: string;
  timestamp: string;
  adminIp: string;
}

export interface SystemStats {
  totalClaims: number;
  pending: number;
  approved: number;
  rejected: number;
  used: number;
  blockedIps: number;
  blockedFingerprints: number;
}
