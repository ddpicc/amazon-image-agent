import type { ComplianceCheckItem, ComplianceImageRole, CompliancePlatform, ComplianceStatus, ComplianceTechnicalInfo } from '@/lib/compliance-check'
import type { DesignPatentCandidate, DesignSearchProfile } from '@/lib/design-patent-search'

export type ComplianceMarket = 'US' | 'AU'
export type ComplianceRiskLevel = 'low' | 'medium' | 'high' | 'unknown'
export type ComplianceConfidence = 'high' | 'medium' | 'low' | 'unknown'

export interface ComplianceRegion {
  x: number
  y: number
  width: number
  height: number
}

export type VisualFindingCategory = 'text' | 'logo' | 'watermark' | 'character' | 'artwork' | 'celebrity' | 'sports' | 'stock' | 'other'

export interface ComplianceVisualFinding {
  key: string
  category: VisualFindingCategory
  imageIndex: number
  detectedText: string | null
  description: string
  region: ComplianceRegion | null
  riskLevel: ComplianceRiskLevel
  confidence: ComplianceConfidence
  evidence: string
  recommendation: string
}

export interface ComplianceBackgroundAnalysis {
  rgb: [number, number, number] | null
  hex: string | null
  edgeNearWhiteRatio: number | null
  edgeUniformity: number | null
  sampledPixelCount: number
  method: 'edge-sampling'
}

export interface ComplianceModuleResult {
  key: 'platform' | 'textLogo' | 'designPatent' | 'copyright'
  title: string
  status: ComplianceStatus
  riskLevel: ComplianceRiskLevel
  confidence: ComplianceConfidence
  summary: string
  items: ComplianceCheckItem[]
  findings: ComplianceVisualFinding[]
  candidates: DesignPatentCandidate[]
  sourceCoverage: string[]
  searchLinks: Array<{ source: string; label: string; url: string }>
  messages: string[]
}

export interface ComplianceScanImage {
  index: number
  role: ComplianceImageRole
  technical: ComplianceTechnicalInfo
  background: ComplianceBackgroundAnalysis
}

export interface ComplianceScanResult {
  platform: CompliancePlatform
  platformLabel: string
  targetMarket: ComplianceMarket
  targetMarketLabel: string
  images: ComplianceScanImage[]
  overallStatus: ComplianceStatus
  overallRiskLevel: ComplianceRiskLevel
  confidence: ComplianceConfidence
  summary: string
  modules: {
    platform: ComplianceModuleResult
    textLogo: ComplianceModuleResult
    designPatent: ComplianceModuleResult
    copyright: ComplianceModuleResult
  }
  patentSearchProfile: DesignSearchProfile | null
  sourceCoverage: string[]
  limitation: string
}
