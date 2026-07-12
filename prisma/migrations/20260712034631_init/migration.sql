-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('TRAVELER', 'EXPERT', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('KRW', 'USD', 'THB', 'VND');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TERMS', 'PRIVACY', 'MARKETING');

-- CreateEnum
CREATE TYPE "ExpertVerificationStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('IDENTITY', 'CERTIFICATE', 'LICENSE', 'OTHER');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('PRIVATE', 'GROUP');

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('INSTANT', 'REQUEST');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('DRAFT', 'PENDING', 'ACCEPTED', 'REJECTED', 'PAYMENT_PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLATION_REQUESTED', 'CANCELLED', 'REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "ParticipantType" AS ENUM ('ADULT', 'CHILD', 'PET');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "PayoutAdjustmentType" AS ENUM ('REFUND', 'CHARGEBACK', 'MANUAL_CORRECTION');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('OPEN', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_REQUESTED', 'BOOKING_ACCEPTED', 'BOOKING_REJECTED', 'BOOKING_CHANGED', 'BOOKING_CANCELLED', 'BOOKING_REMINDER', 'PAYMENT_COMPLETED', 'REFUND_COMPLETED', 'NEW_MESSAGE', 'REVIEW_REQUEST', 'EXPERT_VERIFICATION_RESULT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('REVIEW', 'MESSAGE', 'USER', 'PROGRAM');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('BOOKING', 'PAYMENT', 'REFUND', 'EXPERT', 'ACCOUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateTable
CREATE TABLE "AvailabilityRule" (
    "id" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "programId" TEXT,
    "timezone" TEXT NOT NULL,
    "daysOfWeek" INTEGER[],
    "startTimeLocal" TEXT NOT NULL,
    "endTimeLocal" TEXT NOT NULL,
    "startDateLocal" TEXT,
    "endDateLocal" TEXT,
    "slotDurationMinutes" INTEGER,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySlot" (
    "id" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "programId" TEXT,
    "ruleId" TEXT,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "timezone" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "reservedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "SlotStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingQuote" (
    "id" TEXT NOT NULL,
    "travelerId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "serviceFee" INTEGER NOT NULL,
    "taxes" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "feeRateBps" INTEGER NOT NULL,
    "couponId" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "bookingNumber" TEXT NOT NULL,
    "travelerId" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "bookingType" "BookingType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "timezoneSnapshot" TEXT NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "programTitleSnapshot" TEXT NOT NULL,
    "expertDisplayNameSnapshot" TEXT NOT NULL,
    "meetingPointSnapshot" TEXT,
    "includesSnapshot" TEXT[],
    "cancellationPolicySnapshot" TEXT NOT NULL,
    "contractSnapshot" JSONB NOT NULL,
    "currency" "Currency" NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "serviceFee" INTEGER NOT NULL,
    "taxes" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "specialRequest" TEXT,
    "cancellationReason" TEXT,
    "confirmedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSlot" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "availabilitySlotId" TEXT NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingParticipant" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "ParticipantType" NOT NULL,
    "name" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "countryNameKo" TEXT NOT NULL,
    "countryNameEn" TEXT NOT NULL,
    "cityNameKo" TEXT NOT NULL,
    "cityNameEn" TEXT NOT NULL,
    "descriptionKo" TEXT,
    "descriptionEn" TEXT,
    "coverImageUrl" TEXT,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "timezone" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameKo" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionKo" TEXT,
    "descriptionEn" TEXT,
    "icon" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "fullDescription" TEXT NOT NULL,
    "programType" "ProgramType" NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "bookingType" "BookingType" NOT NULL DEFAULT 'REQUEST',
    "durationDays" INTEGER NOT NULL,
    "sessionCount" INTEGER NOT NULL,
    "maxParticipants" INTEGER NOT NULL DEFAULT 1,
    "languages" TEXT[],
    "includes" TEXT[],
    "excludes" TEXT[],
    "requirements" TEXT[],
    "meetingPoint" TEXT,
    "cancellationPolicy" TEXT NOT NULL,
    "basePrice" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "petFriendly" BOOLEAN NOT NULL DEFAULT false,
    "childFriendly" BOOLEAN NOT NULL DEFAULT false,
    "accommodationIncluded" BOOLEAN NOT NULL DEFAULT false,
    "transportIncluded" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "averageRating" DECIMAL(3,2),
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramMedia" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "type" "MediaType" NOT NULL DEFAULT 'IMAGE',
    "url" TEXT NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "travelerId" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "expertReply" TEXT,
    "expertRepliedAt" TIMESTAMPTZ(6),
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpertFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "specialties" TEXT[],
    "languages" TEXT[],
    "yearsOfExperience" INTEGER NOT NULL DEFAULT 0,
    "baseDestinationId" TEXT NOT NULL,
    "verificationStatus" "ExpertVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "credentialVerified" BOOLEAN NOT NULL DEFAULT false,
    "responseRate" INTEGER,
    "responseTimeMinutes" INTEGER,
    "averageRating" DECIMAL(3,2),
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "completedBookingCount" INTEGER NOT NULL DEFAULT 0,
    "profilePublished" BOOLEAN NOT NULL DEFAULT false,
    "defaultCancellationPolicy" TEXT,
    "verifiedAt" TIMESTAMPTZ(6),
    "verificationNote" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ExpertProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertServiceArea" (
    "id" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,

    CONSTRAINT "ExpertServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertCredential" (
    "id" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "type" "CredentialType" NOT NULL,
    "title" TEXT NOT NULL,
    "issuer" TEXT,
    "issuedAt" TIMESTAMPTZ(6),
    "expiresAt" TIMESTAMPTZ(6),
    "fileKey" TEXT NOT NULL,
    "originalFileName" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "verificationStatus" "CredentialStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ(6),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ExpertCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'TRAVELER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "fullName" TEXT NOT NULL,
    "nickname" TEXT,
    "phone" TEXT,
    "profileImageUrl" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'ko',
    "preferredCurrency" "Currency" NOT NULL DEFAULT 'KRW',
    "country" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Seoul',
    "emailVerifiedAt" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "travelerId" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "bookingId" TEXT,
    "lastMessageAt" TIMESTAMPTZ(6),
    "travelerUnreadCount" INTEGER NOT NULL DEFAULT 0,
    "expertUnreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachmentKey" TEXT,
    "attachmentName" TEXT,
    "attachmentMimeType" TEXT,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkUrl" TEXT,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMPTZ(6),
    "sentAt" TIMESTAMPTZ(6),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT,
    "category" "TicketCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "assignedAdminId" TEXT,
    "resolvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "percentOff" INTEGER,
    "amountOff" INTEGER,
    "currency" "Currency",
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "minSubtotal" INTEGER,
    "validFrom" TIMESTAMPTZ(6) NOT NULL,
    "validUntil" TIMESTAMPTZ(6) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuidePost" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleKo" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "excerptKo" TEXT,
    "excerptEn" TEXT,
    "contentKo" TEXT NOT NULL,
    "contentEn" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "destinationId" TEXT,
    "categoryId" TEXT,
    "authorId" TEXT,
    "publishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "GuidePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "countryCode" TEXT,
    "destinationId" TEXT,
    "purposes" TEXT[],
    "departureDateLocal" TEXT,
    "durationDays" INTEGER,
    "adultsCount" INTEGER NOT NULL DEFAULT 1,
    "childrenCount" INTEGER NOT NULL DEFAULT 0,
    "hasPet" BOOLEAN NOT NULL DEFAULT false,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "budgetCurrency" "Currency" NOT NULL DEFAULT 'KRW',
    "budgetScope" TEXT,
    "stylePreferences" TEXT[],
    "resultSnapshot" JSONB,
    "savedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "referenceExchangeRateId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),
    "processingError" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "baseCurrency" "Currency" NOT NULL,
    "quoteCurrency" "Currency" NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "asOf" TIMESTAMPTZ(6) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "expertId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "grossAmount" INTEGER NOT NULL,
    "platformFee" INTEGER NOT NULL,
    "payoutAmount" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMPTZ(6),
    "approvedAt" TIMESTAMPTZ(6),
    "paidAt" TIMESTAMPTZ(6),
    "paidById" TEXT,
    "paymentReference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutAdjustment" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "type" "PayoutAdjustmentType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "travelPurposes" TEXT[],
    "preferredCountries" TEXT[],
    "preferredCities" TEXT[],
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "budgetCurrency" "Currency" NOT NULL DEFAULT 'KRW',
    "preferredLanguages" TEXT[],
    "travelStyles" TEXT[],
    "groupSize" INTEGER NOT NULL DEFAULT 1,
    "hasChildren" BOOLEAN NOT NULL DEFAULT false,
    "hasPet" BOOLEAN NOT NULL DEFAULT false,
    "accessibilityNeeds" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TravelerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityRule_expertId_active_idx" ON "AvailabilityRule"("expertId", "active");

-- CreateIndex
CREATE INDEX "AvailabilityRule_programId_active_idx" ON "AvailabilityRule"("programId", "active");

-- CreateIndex
CREATE INDEX "AvailabilitySlot_programId_status_startsAt_idx" ON "AvailabilitySlot"("programId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "AvailabilitySlot_expertId_startsAt_idx" ON "AvailabilitySlot"("expertId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilitySlot_expertId_programId_startsAt_endsAt_key" ON "AvailabilitySlot"("expertId", "programId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "BookingQuote_travelerId_status_idx" ON "BookingQuote"("travelerId", "status");

-- CreateIndex
CREATE INDEX "BookingQuote_expiresAt_status_idx" ON "BookingQuote"("expiresAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingNumber_key" ON "Booking"("bookingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_quoteId_key" ON "Booking"("quoteId");

-- CreateIndex
CREATE INDEX "Booking_travelerId_status_idx" ON "Booking"("travelerId", "status");

-- CreateIndex
CREATE INDEX "Booking_expertId_status_idx" ON "Booking"("expertId", "status");

-- CreateIndex
CREATE INDEX "Booking_programId_idx" ON "Booking"("programId");

-- CreateIndex
CREATE INDEX "Booking_status_startsAt_idx" ON "Booking"("status", "startsAt");

-- CreateIndex
CREATE INDEX "BookingSlot_availabilitySlotId_idx" ON "BookingSlot"("availabilitySlotId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSlot_bookingId_availabilitySlotId_key" ON "BookingSlot"("bookingId", "availabilitySlotId");

-- CreateIndex
CREATE INDEX "BookingParticipant_bookingId_idx" ON "BookingParticipant"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Destination_slug_key" ON "Destination"("slug");

-- CreateIndex
CREATE INDEX "Destination_countryCode_active_sortOrder_idx" ON "Destination"("countryCode", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_active_sortOrder_idx" ON "Category"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Program_slug_key" ON "Program"("slug");

-- CreateIndex
CREATE INDEX "Program_destinationId_categoryId_status_idx" ON "Program"("destinationId", "categoryId", "status");

-- CreateIndex
CREATE INDEX "Program_status_featured_idx" ON "Program"("status", "featured");

-- CreateIndex
CREATE INDEX "Program_expertId_status_idx" ON "Program"("expertId", "status");

-- CreateIndex
CREATE INDEX "Program_basePrice_idx" ON "Program"("basePrice");

-- CreateIndex
CREATE INDEX "Program_averageRating_idx" ON "Program"("averageRating");

-- CreateIndex
CREATE INDEX "ProgramMedia_programId_sortOrder_idx" ON "ProgramMedia"("programId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");

-- CreateIndex
CREATE INDEX "Review_programId_status_idx" ON "Review"("programId", "status");

-- CreateIndex
CREATE INDEX "Review_expertId_status_idx" ON "Review"("expertId", "status");

-- CreateIndex
CREATE INDEX "ProgramFavorite_programId_idx" ON "ProgramFavorite"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramFavorite_userId_programId_key" ON "ProgramFavorite"("userId", "programId");

-- CreateIndex
CREATE INDEX "ExpertFavorite_expertId_idx" ON "ExpertFavorite"("expertId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpertFavorite_userId_expertId_key" ON "ExpertFavorite"("userId", "expertId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpertProfile_userId_key" ON "ExpertProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpertProfile_slug_key" ON "ExpertProfile"("slug");

-- CreateIndex
CREATE INDEX "ExpertProfile_verificationStatus_profilePublished_idx" ON "ExpertProfile"("verificationStatus", "profilePublished");

-- CreateIndex
CREATE INDEX "ExpertProfile_baseDestinationId_idx" ON "ExpertProfile"("baseDestinationId");

-- CreateIndex
CREATE INDEX "ExpertServiceArea_destinationId_idx" ON "ExpertServiceArea"("destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpertServiceArea_expertId_destinationId_key" ON "ExpertServiceArea"("expertId", "destinationId");

-- CreateIndex
CREATE INDEX "ExpertCredential_expertId_idx" ON "ExpertCredential"("expertId");

-- CreateIndex
CREATE INDEX "ExpertCredential_verificationStatus_idx" ON "ExpertCredential"("verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ipAddress_createdAt_idx" ON "LoginAttempt"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_type_createdAt_idx" ON "ConsentRecord"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_travelerId_lastMessageAt_idx" ON "Conversation"("travelerId", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "Conversation_expertId_lastMessageAt_idx" ON "Conversation"("expertId", "lastMessageAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_travelerId_expertId_bookingId_key" ON "Conversation"("travelerId", "expertId", "bookingId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_lastAttemptAt_idx" ON "NotificationDelivery"("status", "lastAttemptAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_notificationId_idx" ON "NotificationDelivery"("notificationId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_priority_idx" ON "SupportTicket"("status", "priority");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "Dispute_bookingId_idx" ON "Dispute"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_active_validUntil_idx" ON "Coupon"("active", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_bookingId_key" ON "CouponRedemption"("bookingId");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_userId_idx" ON "CouponRedemption"("couponId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GuidePost_slug_key" ON "GuidePost"("slug");

-- CreateIndex
CREATE INDEX "GuidePost_publishedAt_idx" ON "GuidePost"("publishedAt");

-- CreateIndex
CREATE INDEX "MatchRequest_userId_createdAt_idx" ON "MatchRequest"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminId_createdAt_idx" ON "AdminAuditLog"("adminId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminAuditLog_entityType_entityId_idx" ON "AdminAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerPaymentId_key" ON "Payment"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "WebhookEvent_provider_eventType_receivedAt_idx" ON "WebhookEvent"("provider", "eventType", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_providerEventId_key" ON "WebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "ExchangeRate_baseCurrency_quoteCurrency_asOf_idx" ON "ExchangeRate"("baseCurrency", "quoteCurrency", "asOf" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_baseCurrency_quoteCurrency_asOf_key" ON "ExchangeRate"("baseCurrency", "quoteCurrency", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_bookingId_key" ON "Payout"("bookingId");

-- CreateIndex
CREATE INDEX "Payout_expertId_status_idx" ON "Payout"("expertId", "status");

-- CreateIndex
CREATE INDEX "Payout_status_scheduledAt_idx" ON "Payout"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "PayoutAdjustment_payoutId_idx" ON "PayoutAdjustment"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelerProfile_userId_key" ON "TravelerProfile"("userId");

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "ExpertProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "ExpertProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AvailabilityRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingQuote" ADD CONSTRAINT "BookingQuote_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingQuote" ADD CONSTRAINT "BookingQuote_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingQuote" ADD CONSTRAINT "BookingQuote_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "ExpertProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "BookingQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_availabilitySlotId_fkey" FOREIGN KEY ("availabilitySlotId") REFERENCES "AvailabilitySlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingParticipant" ADD CONSTRAINT "BookingParticipant_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "ExpertProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramMedia" ADD CONSTRAINT "ProgramMedia_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "ExpertProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramFavorite" ADD CONSTRAINT "ProgramFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramFavorite" ADD CONSTRAINT "ProgramFavorite_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertFavorite" ADD CONSTRAINT "ExpertFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertFavorite" ADD CONSTRAINT "ExpertFavorite_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "ExpertProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertProfile" ADD CONSTRAINT "ExpertProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertProfile" ADD CONSTRAINT "ExpertProfile_baseDestinationId_fkey" FOREIGN KEY ("baseDestinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertServiceArea" ADD CONSTRAINT "ExpertServiceArea_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "ExpertProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertServiceArea" ADD CONSTRAINT "ExpertServiceArea_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertCredential" ADD CONSTRAINT "ExpertCredential_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "ExpertProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertCredential" ADD CONSTRAINT "ExpertCredential_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "ExpertProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuidePost" ADD CONSTRAINT "GuidePost_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuidePost" ADD CONSTRAINT "GuidePost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuidePost" ADD CONSTRAINT "GuidePost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRequest" ADD CONSTRAINT "MatchRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRequest" ADD CONSTRAINT "MatchRequest_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformSetting" ADD CONSTRAINT "PlatformSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_referenceExchangeRateId_fkey" FOREIGN KEY ("referenceExchangeRateId") REFERENCES "ExchangeRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_expertId_fkey" FOREIGN KEY ("expertId") REFERENCES "ExpertProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAdjustment" ADD CONSTRAINT "PayoutAdjustment_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAdjustment" ADD CONSTRAINT "PayoutAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelerProfile" ADD CONSTRAINT "TravelerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- Custom SQL (Prisma schema로 표현 불가) — docs/decisions/database-constraints.md
-- 이 섹션은 수동 관리한다. Prisma가 자동 생성하지 않으므로 이후 migration에서
-- 이 인덱스/제약을 덮어쓰지 않는지 리뷰로 확인할 것 (§2 drift 주의).
-- ═══════════════════════════════════════════════════════════════════

-- ── §2 NULLS NOT DISTINCT (PostgreSQL 15+ 필수) ──────────────────────
-- 슬롯 생성 idempotency: programId IS NULL(전문가 공통 슬롯)도 중복 금지
-- docs/decisions/database-constraints.md §2, booking-slot-locking.md
DROP INDEX "AvailabilitySlot_expertId_programId_startsAt_endsAt_key";
CREATE UNIQUE INDEX "AvailabilitySlot_expertId_programId_startsAt_endsAt_key"
  ON "AvailabilitySlot"("expertId", "programId", "startsAt", "endsAt") NULLS NOT DISTINCT;

-- ── §2 partial unique index ─────────────────────────────────────────
-- 일반 문의 대화(bookingId IS NULL)는 traveler-expert 쌍당 1건만 허용
-- docs/decisions/database-constraints.md §2
CREATE UNIQUE INDEX "Conversation_travelerId_expertId_general_key"
  ON "Conversation"("travelerId", "expertId") WHERE "bookingId" IS NULL;

-- ── §1 CHECK constraints ────────────────────────────────────────────
-- docs/decisions/database-constraints.md §1

-- AvailabilityRule: 요일 범위·HH:mm 고정 형식·시간 순서(§2.5 MVP: 자정 넘는 규칙 미지원)
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_capacity_check" CHECK ("capacity" > 0);
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_slotDuration_check" CHECK ("slotDurationMinutes" IS NULL OR "slotDurationMinutes" > 0);
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_daysOfWeek_range_check" CHECK ("daysOfWeek" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]);
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_startTime_format_check" CHECK ("startTimeLocal" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_endTime_format_check" CHECK ("endTimeLocal" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_time_order_check" CHECK ("endTimeLocal" > "startTimeLocal");

-- AvailabilitySlot: 정원·예약 수량·시간 순서
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_capacity_check" CHECK ("capacity" > 0);
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_reserved_range_check" CHECK ("reservedCount" >= 0 AND "reservedCount" <= "capacity");
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_time_order_check" CHECK ("endsAt" > "startsAt");

-- Program
ALTER TABLE "Program" ADD CONSTRAINT "Program_basePrice_check" CHECK ("basePrice" >= 0);
ALTER TABLE "Program" ADD CONSTRAINT "Program_durationDays_check" CHECK ("durationDays" > 0);
ALTER TABLE "Program" ADD CONSTRAINT "Program_sessionCount_check" CHECK ("sessionCount" > 0);
ALTER TABLE "Program" ADD CONSTRAINT "Program_maxParticipants_check" CHECK ("maxParticipants" > 0);

-- BookingQuote: 금액 음수 금지·인원·만료 순서
ALTER TABLE "BookingQuote" ADD CONSTRAINT "BookingQuote_amounts_check" CHECK ("unitPrice" >= 0 AND "subtotal" >= 0 AND "serviceFee" >= 0 AND "taxes" >= 0 AND "discount" >= 0 AND "total" >= 0);
ALTER TABLE "BookingQuote" ADD CONSTRAINT "BookingQuote_participantCount_check" CHECK ("participantCount" > 0);
ALTER TABLE "BookingQuote" ADD CONSTRAINT "BookingQuote_expiry_order_check" CHECK ("expiresAt" > "createdAt");

-- Booking: 금액 음수 금지·인원·기간 순서
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_amounts_check" CHECK ("subtotal" >= 0 AND "serviceFee" >= 0 AND "taxes" >= 0 AND "discount" >= 0 AND "total" >= 0);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_participantCount_check" CHECK ("participantCount" > 0);
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_time_order_check" CHECK ("endsAt" > "startsAt");

-- BookingSlot
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_participantCount_check" CHECK ("participantCount" > 0);

-- Payment: 결제·환불 금액 범위
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refunded_range_check" CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "amount");

-- Payout (정산 원장 — 원본 금액 음수 금지)
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_amounts_check" CHECK ("grossAmount" >= 0 AND "platformFee" >= 0 AND "payoutAmount" >= 0);

-- PayoutAdjustment: 의도적으로 음수 허용(차감 조정), 0만 금지
ALTER TABLE "PayoutAdjustment" ADD CONSTRAINT "PayoutAdjustment_amount_nonzero_check" CHECK ("amount" <> 0);

-- Review
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range_check" CHECK ("rating" BETWEEN 1 AND 5);

-- Coupon: 기간 순서·타입별 필드 상호배타·한도
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_valid_period_check" CHECK ("validUntil" > "validFrom");
-- 주의: CHECK는 NULL 결과 시 통과하므로 IS NOT NULL을 명시해 NULL 우회를 차단한다
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_type_fields_check" CHECK (
  ("type" = 'PERCENTAGE' AND "percentOff" IS NOT NULL AND "percentOff" BETWEEN 1 AND 100 AND "amountOff" IS NULL AND "currency" IS NULL)
  OR
  ("type" = 'FIXED_AMOUNT' AND "amountOff" IS NOT NULL AND "amountOff" > 0 AND "currency" IS NOT NULL AND "percentOff" IS NULL)
);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_maxRedemptions_check" CHECK ("maxRedemptions" IS NULL OR "maxRedemptions" > 0);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_perUserLimit_check" CHECK ("perUserLimit" > 0);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_redemptionCount_check" CHECK ("redemptionCount" >= 0);

-- ExchangeRate
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_rate_check" CHECK ("rate" > 0);

-- ExpertProfile
ALTER TABLE "ExpertProfile" ADD CONSTRAINT "ExpertProfile_responseRate_range_check" CHECK ("responseRate" IS NULL OR ("responseRate" BETWEEN 0 AND 100));
ALTER TABLE "ExpertProfile" ADD CONSTRAINT "ExpertProfile_experience_check" CHECK ("yearsOfExperience" >= 0);

-- TravelerProfile: 예산 범위·그룹 크기
ALTER TABLE "TravelerProfile" ADD CONSTRAINT "TravelerProfile_budget_check" CHECK (
  ("budgetMin" IS NULL OR "budgetMin" >= 0) AND ("budgetMax" IS NULL OR "budgetMax" >= 0)
  AND (("budgetMin" IS NULL OR "budgetMax" IS NULL) OR "budgetMax" >= "budgetMin")
);
ALTER TABLE "TravelerProfile" ADD CONSTRAINT "TravelerProfile_groupSize_check" CHECK ("groupSize" > 0);

-- MatchRequest: 예산 범위·참가자 수량·기간
ALTER TABLE "MatchRequest" ADD CONSTRAINT "MatchRequest_budget_check" CHECK (
  ("budgetMin" IS NULL OR "budgetMin" >= 0) AND ("budgetMax" IS NULL OR "budgetMax" >= 0)
  AND (("budgetMin" IS NULL OR "budgetMax" IS NULL) OR "budgetMax" >= "budgetMin")
);
ALTER TABLE "MatchRequest" ADD CONSTRAINT "MatchRequest_participants_check" CHECK ("adultsCount" >= 1 AND "childrenCount" >= 0);
ALTER TABLE "MatchRequest" ADD CONSTRAINT "MatchRequest_duration_check" CHECK ("durationDays" IS NULL OR "durationDays" > 0);
