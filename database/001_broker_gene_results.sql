/*
  Broker Day gene-result repository

  Run this migration from a reviewed Microsoft Entra-authenticated database
  administrator session against the intended BrokerDay database. The script is
  rerunnable and contains no result data or application-principal membership.

  ReportAccessStatus is an operational publication control. It deliberately
  does not claim, infer, or store consent.

  The runtime role created at the end receives EXECUTE on three narrowly scoped
  read procedures only. Add the intended App Service managed identity to that
  role in a separate, environment-specific administration step.
*/

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF @@TRANCOUNT <> 0
  THROW 51100, 'Run this migration outside an existing transaction.', 1;

IF OBJECT_ID(N'dbo.BrokerDayReportRecipients', N'U') IS NULL
  THROW 51101, 'Expected dbo.BrokerDayReportRecipients is missing.', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  /*
    Keep the external Intelligene identifier on the existing recipient record.
    The filtered unique index allows unmapped recipients while preventing one
    external profile from being linked to multiple recipient rows.
  */
  IF COL_LENGTH(
       N'dbo.BrokerDayReportRecipients',
       N'IntelligeneNumber'
     ) IS NULL
  BEGIN
    ALTER TABLE dbo.BrokerDayReportRecipients
      ADD IntelligeneNumber NVARCHAR(20) NULL;
  END;

  IF NOT EXISTS
  (
    SELECT 1
    FROM sys.columns AS c
    INNER JOIN sys.types AS t
      ON t.user_type_id = c.user_type_id
    WHERE c.object_id = OBJECT_ID(N'dbo.BrokerDayReportRecipients')
      AND c.name = N'IntelligeneNumber'
      AND t.name = N'nvarchar'
      AND c.max_length = 40
      AND c.is_nullable = 1
  )
  BEGIN
    THROW 51102,
      'BrokerDayReportRecipients.IntelligeneNumber has an incompatible shape.',
      1;
  END;

  IF COL_LENGTH(N'dbo.BrokerDayReportRecipients', N'Email') IS NULL
    THROW 51103, 'BrokerDayReportRecipients.Email is missing.', 1;

  IF EXISTS
  (
    SELECT 1
    FROM dbo.BrokerDayReportRecipients AS r
    WHERE r.IntelligeneNumber IS NOT NULL
      AND LEN(LTRIM(RTRIM(r.IntelligeneNumber))) = 0
  )
  BEGIN
    THROW 51104,
      'Blank Intelligene numbers must be corrected before migration.',
      1;
  END;

  IF EXISTS
  (
    SELECT r.IntelligeneNumber
    FROM dbo.BrokerDayReportRecipients AS r
    WHERE r.IntelligeneNumber IS NOT NULL
    GROUP BY r.IntelligeneNumber
    HAVING COUNT_BIG(*) > 1
  )
  BEGIN
    THROW 51105,
      'Duplicate Intelligene numbers must be resolved before migration.',
      1;
  END;

  IF NOT EXISTS
  (
    SELECT 1
    FROM sys.indexes AS i
    WHERE i.object_id = OBJECT_ID(N'dbo.BrokerDayReportRecipients')
      AND i.name =
        N'UX_BrokerDayReportRecipients_IntelligeneNumber'
  )
  BEGIN
    CREATE UNIQUE INDEX
      UX_BrokerDayReportRecipients_IntelligeneNumber
    ON dbo.BrokerDayReportRecipients (IntelligeneNumber)
    WHERE IntelligeneNumber IS NOT NULL;
  END
  ELSE IF NOT EXISTS
  (
    SELECT 1
    FROM sys.indexes AS i
    INNER JOIN sys.index_columns AS ic
      ON ic.object_id = i.object_id
      AND ic.index_id = i.index_id
      AND ic.key_ordinal = 1
    INNER JOIN sys.columns AS c
      ON c.object_id = ic.object_id
      AND c.column_id = ic.column_id
    WHERE i.object_id = OBJECT_ID(N'dbo.BrokerDayReportRecipients')
      AND i.name =
        N'UX_BrokerDayReportRecipients_IntelligeneNumber'
      AND i.is_unique = 1
      AND i.has_filter = 1
      AND REPLACE(
            REPLACE(i.filter_definition, N'[', N''),
            N']',
            N''
          ) LIKE N'%IntelligeneNumber%IS NOT NULL%'
      AND c.name = N'IntelligeneNumber'
      AND NOT EXISTS
      (
        SELECT 1
        FROM sys.index_columns AS extra
        WHERE extra.object_id = i.object_id
          AND extra.index_id = i.index_id
          AND extra.key_ordinal > 1
      )
  )
  BEGIN
    THROW 51106,
      'The existing Intelligene-number index is incompatible.',
      1;
  END;

  IF NOT EXISTS
  (
    SELECT 1
    FROM sys.indexes AS i
    WHERE i.object_id = OBJECT_ID(N'dbo.BrokerDayReportRecipients')
      AND i.name =
        N'IX_BrokerDayReportRecipients_Email_IntelligeneNumber'
  )
  BEGIN
    CREATE INDEX IX_BrokerDayReportRecipients_Email_IntelligeneNumber
    ON dbo.BrokerDayReportRecipients
      (Email, IntelligeneNumber)
    INCLUDE (Id)
    WHERE IntelligeneNumber IS NOT NULL;
  END
  ELSE IF NOT EXISTS
  (
    SELECT 1
    FROM sys.indexes AS i
    INNER JOIN sys.index_columns AS email_ic
      ON email_ic.object_id = i.object_id
      AND email_ic.index_id = i.index_id
      AND email_ic.key_ordinal = 1
    INNER JOIN sys.columns AS email_column
      ON email_column.object_id = email_ic.object_id
      AND email_column.column_id = email_ic.column_id
    INNER JOIN sys.index_columns AS number_ic
      ON number_ic.object_id = i.object_id
      AND number_ic.index_id = i.index_id
      AND number_ic.key_ordinal = 2
    INNER JOIN sys.columns AS number_column
      ON number_column.object_id = number_ic.object_id
      AND number_column.column_id = number_ic.column_id
    WHERE i.object_id = OBJECT_ID(N'dbo.BrokerDayReportRecipients')
      AND i.name =
        N'IX_BrokerDayReportRecipients_Email_IntelligeneNumber'
      AND i.has_filter = 1
      AND REPLACE(
            REPLACE(i.filter_definition, N'[', N''),
            N']',
            N''
          ) LIKE N'%IntelligeneNumber%IS NOT NULL%'
      AND email_column.name = N'Email'
      AND number_column.name = N'IntelligeneNumber'
  )
  BEGIN
    THROW 51107,
      'The existing recipient email/Intelligene index is incompatible.',
      1;
  END;

  IF OBJECT_ID(N'dbo.BrokerGeneImportBatches') IS NOT NULL
     AND OBJECT_ID(N'dbo.BrokerGeneImportBatches', N'U') IS NULL
  BEGIN
    THROW 51108,
      'dbo.BrokerGeneImportBatches exists but is not a table.',
      1;
  END;

  IF OBJECT_ID(N'dbo.BrokerGeneImportBatches', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.BrokerGeneImportBatches
    (
      ImportBatchId BIGINT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_BrokerGeneImportBatches PRIMARY KEY,
      SourceFileSha256 CHAR(64)
        COLLATE Latin1_General_100_BIN2 NOT NULL,
      SourceFileName NVARCHAR(260) NOT NULL,
      SourceByteLength BIGINT NOT NULL,
      WorkbookSchemaVersion NVARCHAR(40) NOT NULL,
      ImporterVersion NVARCHAR(40) NOT NULL,
      ImportedProfileCount INT NOT NULL,
      ImportedResultRowCount INT NOT NULL,
      ImportedAtUtc DATETIME2(0) NOT NULL
        CONSTRAINT DF_BrokerGeneImportBatches_ImportedAtUtc
        DEFAULT SYSUTCDATETIME(),
      ImportedBy NVARCHAR(256) NOT NULL
        CONSTRAINT DF_BrokerGeneImportBatches_ImportedBy
        DEFAULT SUSER_SNAME(),
      RowVersion ROWVERSION NOT NULL,
      CONSTRAINT UQ_BrokerGeneImportBatches_SourceFileSha256
        UNIQUE (SourceFileSha256),
      CONSTRAINT CK_BrokerGeneImportBatches_SourceFileSha256
        CHECK
        (
          LEN(SourceFileSha256) = 64
          AND SourceFileSha256 NOT LIKE '%[^0-9A-F]%'
        ),
      CONSTRAINT CK_BrokerGeneImportBatches_SourceFileName
        CHECK
        (
          LEN(LTRIM(RTRIM(SourceFileName))) > 0
          AND SourceFileName NOT LIKE N'%/%'
          AND SourceFileName NOT LIKE N'%\%'
        ),
      CONSTRAINT CK_BrokerGeneImportBatches_Counts
        CHECK
        (
          SourceByteLength > 0
          AND ImportedProfileCount >= 0
          AND ImportedResultRowCount >= 0
        )
    );
  END
  ELSE IF
  (
    COL_LENGTH(N'dbo.BrokerGeneImportBatches', N'ImportBatchId') IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneImportBatches',
         N'SourceFileSha256'
       ) IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneImportBatches',
         N'WorkbookSchemaVersion'
       ) IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneImportBatches',
         N'ImporterVersion'
       ) IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneImportBatches',
         N'ImportedProfileCount'
       ) IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneImportBatches',
         N'ImportedResultRowCount'
       ) IS NULL
    OR COL_LENGTH(N'dbo.BrokerGeneImportBatches', N'RowVersion') IS NULL
  )
  BEGIN
    THROW 51109,
      'dbo.BrokerGeneImportBatches has an incompatible shape.',
      1;
  END;

  IF OBJECT_ID(N'dbo.BrokerGeneProfileSnapshots') IS NOT NULL
     AND OBJECT_ID(N'dbo.BrokerGeneProfileSnapshots', N'U') IS NULL
  BEGIN
    THROW 51110,
      'dbo.BrokerGeneProfileSnapshots exists but is not a table.',
      1;
  END;

  IF OBJECT_ID(N'dbo.BrokerGeneProfileSnapshots', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.BrokerGeneProfileSnapshots
    (
      ProfileId BIGINT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_BrokerGeneProfileSnapshots PRIMARY KEY,
      ImportBatchId BIGINT NOT NULL,
      IntelligeneNumber NVARCHAR(20) NOT NULL,
      ReportAccessStatus VARCHAR(8) NOT NULL,
      ReportStatus VARCHAR(8) NOT NULL,
      SexAtBirth CHAR(1) NOT NULL,
      DateOfBirth DATE NULL,
      SampleId NVARCHAR(100) NULL,
      AssayName NVARCHAR(160) NULL,
      AssayVersion NVARCHAR(80) NULL,
      AssayStrand VARCHAR(7) NOT NULL,
      ExpectedVariantCount INT NOT NULL,
      ObservedVariantCount INT NOT NULL,
      ProcessedAtUtc DATETIME2(0) NULL,
      SourceSheetName NVARCHAR(128) NOT NULL,
      SourceRowNumber INT NOT NULL,
      CreatedAtUtc DATETIME2(0) NOT NULL
        CONSTRAINT DF_BrokerGeneProfileSnapshots_CreatedAtUtc
        DEFAULT SYSUTCDATETIME(),
      RowVersion ROWVERSION NOT NULL,
      CONSTRAINT FK_BrokerGeneProfileSnapshots_ImportBatch
        FOREIGN KEY (ImportBatchId)
        REFERENCES dbo.BrokerGeneImportBatches (ImportBatchId),
      CONSTRAINT UQ_BrokerGeneProfileSnapshots_BatchNumber
        UNIQUE (ImportBatchId, IntelligeneNumber),
      CONSTRAINT UQ_BrokerGeneProfileSnapshots_ProfileNumber
        UNIQUE (ProfileId, IntelligeneNumber),
      CONSTRAINT CK_BrokerGeneProfileSnapshots_AccessStatus
        CHECK (ReportAccessStatus IN ('enabled', 'disabled')),
      CONSTRAINT CK_BrokerGeneProfileSnapshots_ReportStatus
        CHECK (ReportStatus IN ('ready', 'partial', 'rejected')),
      CONSTRAINT CK_BrokerGeneProfileSnapshots_SexAtBirth
        CHECK (SexAtBirth IN ('X', 'F', 'M')),
      CONSTRAINT CK_BrokerGeneProfileSnapshots_AssayStrand
        CHECK (AssayStrand IN ('forward', 'reverse', 'unknown')),
      CONSTRAINT CK_BrokerGeneProfileSnapshots_Counts
        CHECK
        (
          ExpectedVariantCount >= 0
          AND ObservedVariantCount >= 0
        ),
      CONSTRAINT CK_BrokerGeneProfileSnapshots_Source
        CHECK
        (
          LEN(LTRIM(RTRIM(SourceSheetName))) > 0
          AND SourceRowNumber >= 1
        ),
      CONSTRAINT CK_BrokerGeneProfileSnapshots_IntelligeneNumber
        CHECK
        (
          LEN(IntelligeneNumber) BETWEEN 3 AND 20
          AND IntelligeneNumber
                COLLATE Latin1_General_100_BIN2 LIKE N'IG[0-9]%'
          AND IntelligeneNumber
                COLLATE Latin1_General_100_BIN2
                NOT LIKE N'%[^A-Z0-9-]%'
          AND DATALENGTH(IntelligeneNumber) =
              DATALENGTH(LTRIM(RTRIM(IntelligeneNumber)))
        )
    );
  END
  ELSE IF
  (
    COL_LENGTH(N'dbo.BrokerGeneProfileSnapshots', N'ProfileId') IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneProfileSnapshots',
         N'ImportBatchId'
       ) IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneProfileSnapshots',
         N'IntelligeneNumber'
       ) IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneProfileSnapshots',
         N'ReportAccessStatus'
       ) IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneProfileSnapshots',
         N'ReportStatus'
       ) IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneProfileSnapshots',
         N'SexAtBirth'
       ) IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneProfileSnapshots',
         N'DateOfBirth'
       ) IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneProfileSnapshots',
         N'AssayStrand'
       ) IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneProfileSnapshots',
         N'ExpectedVariantCount'
       ) IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneProfileSnapshots',
         N'ObservedVariantCount'
       ) IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneProfileSnapshots',
         N'RowVersion'
       ) IS NULL
  )
  BEGIN
    THROW 51111,
      'dbo.BrokerGeneProfileSnapshots has an incompatible shape.',
      1;
  END;

  IF NOT EXISTS
  (
    SELECT 1
    FROM sys.indexes AS i
    WHERE i.object_id = OBJECT_ID(N'dbo.BrokerGeneProfileSnapshots')
      AND i.name = N'IX_BrokerGeneProfileSnapshots_NumberBatch'
  )
  BEGIN
    CREATE INDEX IX_BrokerGeneProfileSnapshots_NumberBatch
    ON dbo.BrokerGeneProfileSnapshots
      (IntelligeneNumber, ImportBatchId DESC)
    INCLUDE
      (
        ProfileId,
        ReportAccessStatus,
        ReportStatus,
        ProcessedAtUtc
      );
  END;

  IF OBJECT_ID(N'dbo.BrokerGeneResultCalls') IS NOT NULL
     AND OBJECT_ID(N'dbo.BrokerGeneResultCalls', N'U') IS NULL
  BEGIN
    THROW 51112,
      'dbo.BrokerGeneResultCalls exists but is not a table.',
      1;
  END;

  IF OBJECT_ID(N'dbo.BrokerGeneResultCalls', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.BrokerGeneResultCalls
    (
      ResultCallId BIGINT IDENTITY(1,1) NOT NULL
        CONSTRAINT PK_BrokerGeneResultCalls PRIMARY KEY,
      ProfileId BIGINT NOT NULL,
      SourceSheetName NVARCHAR(128) NOT NULL,
      SourceRowNumber INT NOT NULL,
      SourceColumnNumber INT NOT NULL,
      SourceColumnName NVARCHAR(256) NOT NULL,
      RawGene NVARCHAR(160) NULL,
      RawVariantId NVARCHAR(160) NULL,
      RawValue NVARCHAR(4000) NULL,
      RawSourceRowJson NVARCHAR(MAX) NOT NULL,
      VariantId NVARCHAR(64) NULL,
      NormalizedValue NVARCHAR(64) NULL,
      Quality DECIMAL(9,6) NULL,
      IsCanonical BIT NOT NULL,
      DuplicateReason NVARCHAR(64) NULL,
      CreatedAtUtc DATETIME2(0) NOT NULL
        CONSTRAINT DF_BrokerGeneResultCalls_CreatedAtUtc
        DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_BrokerGeneResultCalls_Profile
        FOREIGN KEY (ProfileId)
        REFERENCES dbo.BrokerGeneProfileSnapshots (ProfileId),
      CONSTRAINT UQ_BrokerGeneResultCalls_SourceCell
        UNIQUE
        (
          ProfileId,
          SourceSheetName,
          SourceRowNumber,
          SourceColumnNumber
        ),
      CONSTRAINT CK_BrokerGeneResultCalls_Source
        CHECK
        (
          LEN(LTRIM(RTRIM(SourceSheetName))) > 0
          AND SourceRowNumber >= 1
          AND SourceColumnNumber >= 1
          AND LEN(LTRIM(RTRIM(SourceColumnName))) > 0
          AND ISJSON(RawSourceRowJson) = 1
        ),
      CONSTRAINT CK_BrokerGeneResultCalls_Quality
        CHECK (Quality IS NULL OR Quality BETWEEN 0 AND 1),
      CONSTRAINT CK_BrokerGeneResultCalls_Canonical
        CHECK
        (
          (
            IsCanonical = 1
            AND VariantId IS NOT NULL
            AND NormalizedValue IS NOT NULL
            AND DuplicateReason IS NULL
          )
          OR
          (
            IsCanonical = 0
            AND DuplicateReason IS NOT NULL
            AND LEN(LTRIM(RTRIM(DuplicateReason))) > 0
          )
        )
    );
  END
  ELSE IF
  (
    COL_LENGTH(N'dbo.BrokerGeneResultCalls', N'ResultCallId') IS NULL
    OR COL_LENGTH(N'dbo.BrokerGeneResultCalls', N'ProfileId') IS NULL
    OR COL_LENGTH(
         N'dbo.BrokerGeneResultCalls',
         N'RawSourceRowJson'
       ) IS NULL
    OR COL_LENGTH(N'dbo.BrokerGeneResultCalls', N'RawValue') IS NULL
    OR COL_LENGTH(N'dbo.BrokerGeneResultCalls', N'NormalizedValue') IS NULL
    OR COL_LENGTH(N'dbo.BrokerGeneResultCalls', N'IsCanonical') IS NULL
    OR COL_LENGTH(N'dbo.BrokerGeneResultCalls', N'DuplicateReason') IS NULL
  )
  BEGIN
    THROW 51113,
      'dbo.BrokerGeneResultCalls has an incompatible shape.',
      1;
  END;

  IF NOT EXISTS
  (
    SELECT 1
    FROM sys.indexes AS i
    WHERE i.object_id = OBJECT_ID(N'dbo.BrokerGeneResultCalls')
      AND i.name = N'UX_BrokerGeneResultCalls_CanonicalVariant'
  )
  BEGIN
    CREATE UNIQUE INDEX UX_BrokerGeneResultCalls_CanonicalVariant
    ON dbo.BrokerGeneResultCalls (ProfileId, VariantId)
    INCLUDE (NormalizedValue, Quality)
    WHERE IsCanonical = 1 AND VariantId IS NOT NULL;
  END
  ELSE IF NOT EXISTS
  (
    SELECT 1
    FROM sys.indexes AS i
    INNER JOIN sys.index_columns AS profile_ic
      ON profile_ic.object_id = i.object_id
      AND profile_ic.index_id = i.index_id
      AND profile_ic.key_ordinal = 1
    INNER JOIN sys.columns AS profile_column
      ON profile_column.object_id = profile_ic.object_id
      AND profile_column.column_id = profile_ic.column_id
    INNER JOIN sys.index_columns AS variant_ic
      ON variant_ic.object_id = i.object_id
      AND variant_ic.index_id = i.index_id
      AND variant_ic.key_ordinal = 2
    INNER JOIN sys.columns AS variant_column
      ON variant_column.object_id = variant_ic.object_id
      AND variant_column.column_id = variant_ic.column_id
    WHERE i.object_id = OBJECT_ID(N'dbo.BrokerGeneResultCalls')
      AND i.name = N'UX_BrokerGeneResultCalls_CanonicalVariant'
      AND i.is_unique = 1
      AND i.has_filter = 1
      AND REPLACE(
            REPLACE(i.filter_definition, N'[', N''),
            N']',
            N''
          ) LIKE N'%IsCanonical%(1)%'
      AND REPLACE(
            REPLACE(i.filter_definition, N'[', N''),
            N']',
            N''
          ) LIKE N'%VariantId%IS NOT NULL%'
      AND profile_column.name = N'ProfileId'
      AND variant_column.name = N'VariantId'
  )
  BEGIN
    THROW 51114,
      'The existing canonical-result index is incompatible.',
      1;
  END;

  IF OBJECT_ID(N'dbo.BrokerGeneCurrentProfiles') IS NOT NULL
     AND OBJECT_ID(N'dbo.BrokerGeneCurrentProfiles', N'U') IS NULL
  BEGIN
    THROW 51115,
      'dbo.BrokerGeneCurrentProfiles exists but is not a table.',
      1;
  END;

  IF OBJECT_ID(N'dbo.BrokerGeneCurrentProfiles', N'U') IS NULL
  BEGIN
    CREATE TABLE dbo.BrokerGeneCurrentProfiles
    (
      IntelligeneNumber NVARCHAR(20) NOT NULL
        CONSTRAINT PK_BrokerGeneCurrentProfiles PRIMARY KEY,
      ProfileId BIGINT NOT NULL,
      SelectedAtUtc DATETIME2(0) NOT NULL
        CONSTRAINT DF_BrokerGeneCurrentProfiles_SelectedAtUtc
        DEFAULT SYSUTCDATETIME(),
      RowVersion ROWVERSION NOT NULL,
      CONSTRAINT UQ_BrokerGeneCurrentProfiles_ProfileId
        UNIQUE (ProfileId),
      CONSTRAINT FK_BrokerGeneCurrentProfiles_Profile
        FOREIGN KEY (ProfileId, IntelligeneNumber)
        REFERENCES dbo.BrokerGeneProfileSnapshots
          (ProfileId, IntelligeneNumber)
    );
  END
  ELSE IF
  (
    COL_LENGTH(
      N'dbo.BrokerGeneCurrentProfiles',
      N'IntelligeneNumber'
    ) IS NULL
    OR COL_LENGTH(N'dbo.BrokerGeneCurrentProfiles', N'ProfileId') IS NULL
    OR COL_LENGTH(N'dbo.BrokerGeneCurrentProfiles', N'RowVersion') IS NULL
  )
  BEGIN
    THROW 51116,
      'dbo.BrokerGeneCurrentProfiles has an incompatible shape.',
      1;
  END;

  /*
    Resolve one and only one distinct Intelligene number for the supplied email.
    Duplicate recipient rows that carry the same number are harmless; an email
    linked to different numbers fails closed. No email or name is projected.
  */
  EXEC sys.sp_executesql N'
CREATE OR ALTER PROCEDURE dbo.usp_BrokerGene_GetProfileByEmail
  @Email NVARCHAR(320)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @NormalizedEmail NVARCHAR(320) =
    LOWER(LTRIM(RTRIM(@Email)));

  ;WITH RecipientNumbers AS
  (
    SELECT DISTINCT r.IntelligeneNumber
    FROM dbo.BrokerDayReportRecipients AS r
    WHERE LOWER(LTRIM(RTRIM(r.Email))) = @NormalizedEmail
      AND r.IntelligeneNumber IS NOT NULL
  ),
  ResolvedNumber AS
  (
    SELECT MIN(n.IntelligeneNumber) AS IntelligeneNumber
    FROM RecipientNumbers AS n
    HAVING COUNT_BIG(*) = 1
  )
  SELECT
    CONVERT(NVARCHAR(32), p.ProfileId) AS profileId,
    p.IntelligeneNumber AS memberNumber,
    p.DateOfBirth AS dateOfBirth,
    p.SexAtBirth AS sexAtBirth,
    p.SampleId AS sampleId,
    p.AssayName AS assayName,
    p.AssayVersion AS assayVersion,
    p.AssayStrand AS assayStrand,
    p.ReportAccessStatus AS reportAccessStatus,
    p.ReportStatus AS reportStatus,
    p.ProcessedAtUtc AS processedAt,
    p.ExpectedVariantCount AS expectedVariantCount,
    p.ObservedVariantCount AS observedVariantCount
  FROM ResolvedNumber AS resolved
  INNER JOIN dbo.BrokerGeneCurrentProfiles AS current_profile
    ON current_profile.IntelligeneNumber = resolved.IntelligeneNumber
  INNER JOIN dbo.BrokerGeneProfileSnapshots AS p
    ON p.ProfileId = current_profile.ProfileId
    AND p.IntelligeneNumber = current_profile.IntelligeneNumber
  WHERE p.ReportAccessStatus = ''enabled''
    AND p.ReportStatus = ''ready''
    AND p.ProcessedAtUtc IS NOT NULL
    AND EXISTS
    (
      SELECT 1
      FROM dbo.BrokerGeneResultCalls AS result_call
      WHERE result_call.ProfileId = p.ProfileId
        AND result_call.IsCanonical = 1
        AND result_call.VariantId IS NOT NULL
        AND result_call.NormalizedValue IS NOT NULL
    );
END;';

  /*
    The number lookup still requires an existing recipient mapping. It cannot
    expose workbook-only profiles that have not been linked for distribution.
  */
  EXEC sys.sp_executesql N'
CREATE OR ALTER PROCEDURE dbo.usp_BrokerGene_GetProfileByNumber
  @IntelligeneNumber NVARCHAR(20)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @NormalizedNumber NVARCHAR(20) =
    UPPER(LTRIM(RTRIM(@IntelligeneNumber)));

  SELECT
    CONVERT(NVARCHAR(32), p.ProfileId) AS profileId,
    p.IntelligeneNumber AS memberNumber,
    p.DateOfBirth AS dateOfBirth,
    p.SexAtBirth AS sexAtBirth,
    p.SampleId AS sampleId,
    p.AssayName AS assayName,
    p.AssayVersion AS assayVersion,
    p.AssayStrand AS assayStrand,
    p.ReportAccessStatus AS reportAccessStatus,
    p.ReportStatus AS reportStatus,
    p.ProcessedAtUtc AS processedAt,
    p.ExpectedVariantCount AS expectedVariantCount,
    p.ObservedVariantCount AS observedVariantCount
  FROM dbo.BrokerGeneCurrentProfiles AS current_profile
  INNER JOIN dbo.BrokerGeneProfileSnapshots AS p
    ON p.ProfileId = current_profile.ProfileId
    AND p.IntelligeneNumber = current_profile.IntelligeneNumber
  WHERE current_profile.IntelligeneNumber = @NormalizedNumber
    AND p.ReportAccessStatus = ''enabled''
    AND p.ReportStatus = ''ready''
    AND p.ProcessedAtUtc IS NOT NULL
    AND EXISTS
    (
      SELECT 1
      FROM dbo.BrokerDayReportRecipients AS recipient
      WHERE recipient.IntelligeneNumber = p.IntelligeneNumber
    )
    AND EXISTS
    (
      SELECT 1
      FROM dbo.BrokerGeneResultCalls AS result_call
      WHERE result_call.ProfileId = p.ProfileId
        AND result_call.IsCanonical = 1
        AND result_call.VariantId IS NOT NULL
        AND result_call.NormalizedValue IS NOT NULL
    );
END;';

  /*
    Return only canonical normalized calls for the exact current profile. Raw
    workbook values and duplicate rows remain available to administrators in
    the table but are never projected through the runtime procedure.
  */
  EXEC sys.sp_executesql N'
CREATE OR ALTER PROCEDURE dbo.usp_BrokerGene_GetResultsByProfileId
  @ProfileId BIGINT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    CONVERT(NVARCHAR(32), result_call.ProfileId) AS profileId,
    result_call.RawGene AS gene,
    result_call.VariantId AS variantId,
    result_call.NormalizedValue AS genotype,
    result_call.Quality AS quality
  FROM dbo.BrokerGeneResultCalls AS result_call
  INNER JOIN dbo.BrokerGeneProfileSnapshots AS p
    ON p.ProfileId = result_call.ProfileId
  INNER JOIN dbo.BrokerGeneCurrentProfiles AS current_profile
    ON current_profile.ProfileId = p.ProfileId
    AND current_profile.IntelligeneNumber = p.IntelligeneNumber
  WHERE result_call.ProfileId = @ProfileId
    AND result_call.IsCanonical = 1
    AND result_call.VariantId IS NOT NULL
    AND result_call.NormalizedValue IS NOT NULL
    AND p.ReportAccessStatus = ''enabled''
    AND p.ReportStatus = ''ready''
    AND p.ProcessedAtUtc IS NOT NULL
    AND EXISTS
    (
      SELECT 1
      FROM dbo.BrokerDayReportRecipients AS recipient
      WHERE recipient.IntelligeneNumber = p.IntelligeneNumber
    )
  ORDER BY result_call.VariantId, result_call.ResultCallId;
END;';

  IF DATABASE_PRINCIPAL_ID(N'broker_gene_report_executor') IS NULL
  BEGIN
    EXEC(N'CREATE ROLE [broker_gene_report_executor] AUTHORIZATION [dbo];');
  END
  ELSE IF NOT EXISTS
  (
    SELECT 1
    FROM sys.database_principals AS principal
    WHERE principal.principal_id =
      DATABASE_PRINCIPAL_ID(N'broker_gene_report_executor')
      AND principal.type = 'R'
  )
  BEGIN
    THROW 51117,
      'broker_gene_report_executor exists but is not a database role.',
      1;
  END;

  GRANT EXECUTE
    ON OBJECT::dbo.usp_BrokerGene_GetProfileByEmail
    TO broker_gene_report_executor;
  GRANT EXECUTE
    ON OBJECT::dbo.usp_BrokerGene_GetProfileByNumber
    TO broker_gene_report_executor;
  GRANT EXECUTE
    ON OBJECT::dbo.usp_BrokerGene_GetResultsByProfileId
    TO broker_gene_report_executor;

  IF EXISTS
  (
    SELECT 1
    FROM sys.database_role_members AS membership
    WHERE membership.member_principal_id =
      DATABASE_PRINCIPAL_ID(N'broker_gene_report_executor')
  )
  BEGIN
    THROW 51118,
      'broker_gene_report_executor must not inherit another database role.',
      1;
  END;

  IF EXISTS
  (
    SELECT 1
    FROM sys.database_permissions AS permission
    WHERE permission.grantee_principal_id =
      DATABASE_PRINCIPAL_ID(N'broker_gene_report_executor')
      AND NOT
      (
        permission.class = 1
        AND permission.permission_name = N'EXECUTE'
        AND permission.state IN ('G', 'W')
        AND permission.major_id IN
        (
          OBJECT_ID(N'dbo.usp_BrokerGene_GetProfileByEmail'),
          OBJECT_ID(N'dbo.usp_BrokerGene_GetProfileByNumber'),
          OBJECT_ID(N'dbo.usp_BrokerGene_GetResultsByProfileId')
        )
      )
  )
  BEGIN
    THROW 51119,
      'broker_gene_report_executor has permissions outside the approved procedures.',
      1;
  END;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;
