/*
  Administrative importer for the approved long-form workbook contract:

    sourceRow, swabCode, geneSymbol, rsNumber, result

  The web application role is deliberately not granted access to this
  procedure. Run it only from a reviewed Microsoft Entra database-admin
  session. The whole import is validated and committed atomically.
*/

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

CREATE OR ALTER PROCEDURE dbo.usp_BrokerGene_ImportWorkbook
  @SourceFileSha256 CHAR(64),
  @SourceFileName NVARCHAR(260),
  @SourceByteLength BIGINT,
  @RowsJson NVARCHAR(MAX),
  @ExpectedProfileCount INT,
  @ExpectedRawResultRowCount INT,
  @ExpectedCanonicalResultCount INT,
  @ExpectedVariantCountPerReadyProfile INT,
  @AssayName NVARCHAR(160),
  @AssayVersion NVARCHAR(80),
  @AssayStrand VARCHAR(7) = 'unknown',
  @ImportScope VARCHAR(8) = 'full',
  @SourceTimestampUtc DATETIME2(0) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @@TRANCOUNT <> 0
    THROW 51200, 'Run the gene importer outside an existing transaction.', 1;

  IF OBJECT_ID(N'dbo.BrokerGeneImportBatches', N'U') IS NULL
     OR OBJECT_ID(N'dbo.BrokerGeneProfileSnapshots', N'U') IS NULL
     OR OBJECT_ID(N'dbo.BrokerGeneResultCalls', N'U') IS NULL
     OR OBJECT_ID(N'dbo.BrokerGeneCurrentProfiles', N'U') IS NULL
  BEGIN
    THROW 51201, 'Run the broker gene repository migration first.', 1;
  END;

  SET @SourceFileSha256 = UPPER(LTRIM(RTRIM(@SourceFileSha256)));
  SET @SourceFileName = LTRIM(RTRIM(@SourceFileName));
  SET @AssayName = LTRIM(RTRIM(@AssayName));
  SET @AssayVersion = LTRIM(RTRIM(@AssayVersion));
  SET @AssayStrand = LOWER(LTRIM(RTRIM(@AssayStrand)));
  SET @ImportScope = LOWER(LTRIM(RTRIM(@ImportScope)));

  IF LEN(@SourceFileSha256) <> 64
     OR @SourceFileSha256 LIKE '%[^0-9A-F]%'
     OR @SourceByteLength <= 0
     OR LEN(@SourceFileName) = 0
     OR @SourceFileName LIKE N'%/%'
     OR @SourceFileName LIKE N'%\%'
     OR LEN(@AssayName) = 0
     OR LEN(@AssayVersion) = 0
     OR @AssayStrand NOT IN ('forward', 'reverse', 'unknown')
     OR @ImportScope NOT IN ('full', 'delta')
     OR @ExpectedProfileCount <= 0
     OR @ExpectedRawResultRowCount <= 0
     OR @ExpectedCanonicalResultCount <= 0
     OR @ExpectedCanonicalResultCount > @ExpectedRawResultRowCount
     OR @ExpectedVariantCountPerReadyProfile <= 0
     OR ISJSON(@RowsJson) <> 1
  BEGIN
    THROW 51202, 'The gene import manifest is invalid.', 1;
  END;

  CREATE TABLE #Rows
  (
    SourceRowNumber INT NOT NULL PRIMARY KEY,
    IntelligeneNumber NVARCHAR(20) NOT NULL,
    GeneSymbol NVARCHAR(160) NOT NULL,
    VariantId NVARCHAR(64) NOT NULL,
    NormalizedValue NVARCHAR(64) NOT NULL,
    RawGene NVARCHAR(160) NOT NULL,
    RawVariantId NVARCHAR(160) NOT NULL,
    RawValue NVARCHAR(4000) NOT NULL,
    RawSourceRowJson NVARCHAR(MAX) NOT NULL
  );

  INSERT #Rows
  (
    SourceRowNumber,
    IntelligeneNumber,
    GeneSymbol,
    VariantId,
    NormalizedValue,
    RawGene,
    RawVariantId,
    RawValue,
    RawSourceRowJson
  )
  SELECT
    parsed.sourceRow,
    UPPER(LTRIM(RTRIM(parsed.swabCode))),
    UPPER(LTRIM(RTRIM(parsed.geneSymbol))),
    LOWER(LTRIM(RTRIM(parsed.rsNumber))),
    UPPER(LTRIM(RTRIM(parsed.result))),
    parsed.geneSymbol,
    parsed.rsNumber,
    parsed.result,
    source_row.[value]
  FROM OPENJSON(@RowsJson) AS source_row
  CROSS APPLY OPENJSON(source_row.[value])
  WITH
  (
    sourceRow INT '$.sourceRow',
    swabCode NVARCHAR(100) '$.swabCode',
    geneSymbol NVARCHAR(400) '$.geneSymbol',
    rsNumber NVARCHAR(400) '$.rsNumber',
    result NVARCHAR(4000) '$.result'
  ) AS parsed;

  IF (SELECT COUNT_BIG(*) FROM #Rows) <> @ExpectedRawResultRowCount
    THROW 51203, 'The workbook row count does not match its manifest.', 1;

  IF EXISTS
  (
    SELECT 1
    FROM #Rows AS source_row
    WHERE source_row.SourceRowNumber < 2
      OR LEN(source_row.IntelligeneNumber) NOT BETWEEN 3 AND 20
      OR source_row.IntelligeneNumber
           COLLATE Latin1_General_100_BIN2 NOT LIKE N'IG[0-9]%'
      OR SUBSTRING(source_row.IntelligeneNumber, 3, 18)
           COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9]%'
      OR LEN(source_row.GeneSymbol) = 0
      OR LEN(source_row.VariantId) NOT BETWEEN 3 AND 64
      OR source_row.VariantId
           COLLATE Latin1_General_100_BIN2 NOT LIKE N'rs[0-9]%'
      OR SUBSTRING(source_row.VariantId, 3, 62)
           COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9]%'
      OR LEN(source_row.NormalizedValue) = 0
      OR DATALENGTH(source_row.RawSourceRowJson) > 16000
  )
  BEGIN
    THROW 51204, 'A workbook row failed strict source validation.', 1;
  END;

  IF
  (
    SELECT COUNT_BIG(DISTINCT IntelligeneNumber)
    FROM #Rows
  ) <> @ExpectedProfileCount
  BEGIN
    THROW 51205, 'The workbook profile count does not match its manifest.', 1;
  END;

  IF EXISTS
  (
    SELECT
      source_row.IntelligeneNumber,
      source_row.VariantId
    FROM #Rows AS source_row
    GROUP BY
      source_row.IntelligeneNumber,
      source_row.VariantId
    HAVING COUNT_BIG
    (
      DISTINCT source_row.NormalizedValue
        COLLATE Latin1_General_100_BIN2
    ) > 1
  )
  BEGIN
    THROW 51206, 'Conflicting duplicate genotype calls were found.', 1;
  END;

  IF
  (
    SELECT COUNT_BIG(*)
    FROM
    (
      SELECT
        source_row.IntelligeneNumber,
        source_row.VariantId
      FROM #Rows AS source_row
      GROUP BY
        source_row.IntelligeneNumber,
        source_row.VariantId
    ) AS canonical_rows
  ) <> @ExpectedCanonicalResultCount
  BEGIN
    THROW 51207, 'The canonical result count does not match its manifest.', 1;
  END;

  CREATE TABLE #Profiles
  (
    IntelligeneNumber NVARCHAR(20) NOT NULL PRIMARY KEY,
    ObservedVariantCount INT NOT NULL,
    SourceRowNumber INT NOT NULL,
    RecipientId INT NULL,
    SexAtBirth CHAR(1) NOT NULL
  );

  INSERT #Profiles
  (
    IntelligeneNumber,
    ObservedVariantCount,
    SourceRowNumber,
    RecipientId,
    SexAtBirth
  )
  SELECT
    calls.IntelligeneNumber,
    calls.ObservedVariantCount,
    calls.SourceRowNumber,
    recipient.Id,
    CASE
      WHEN UPPER(LTRIM(RTRIM(latest_sleep.BiologicalSex))) IN ('F', 'M')
        THEN UPPER(LTRIM(RTRIM(latest_sleep.BiologicalSex)))
      ELSE 'X'
    END
  FROM
  (
    SELECT
      source_row.IntelligeneNumber,
      COUNT(DISTINCT source_row.VariantId) AS ObservedVariantCount,
      MIN(source_row.SourceRowNumber) AS SourceRowNumber
    FROM #Rows AS source_row
    GROUP BY source_row.IntelligeneNumber
  ) AS calls
  LEFT JOIN dbo.BrokerDayReportRecipients AS recipient
    ON recipient.IntelligeneNumber = calls.IntelligeneNumber
  OUTER APPLY
  (
    SELECT TOP (1) sleep.BiologicalSex
    FROM dbo.SleepAssessmentSubmissions AS sleep
    WHERE sleep.Email = recipient.Email
    ORDER BY
      sleep.CompletedAt DESC,
      sleep.ReceivedAt DESC,
      sleep.SubmissionId
  ) AS latest_sleep;

  IF EXISTS
  (
    SELECT 1
    FROM #Profiles AS profile
    WHERE profile.RecipientId IS NULL
  )
  BEGIN
    THROW 51208, 'A workbook IG number has no exact recipient mapping.', 1;
  END;

  DECLARE @ExistingImportBatchId BIGINT =
  (
    SELECT batch.ImportBatchId
    FROM dbo.BrokerGeneImportBatches AS batch
    WHERE batch.SourceFileSha256 = @SourceFileSha256
  );

  IF @ExistingImportBatchId IS NOT NULL
  BEGIN
    IF NOT EXISTS
    (
      SELECT 1
      FROM dbo.BrokerGeneImportBatches AS batch
      WHERE batch.ImportBatchId = @ExistingImportBatchId
        AND batch.SourceFileName = @SourceFileName
        AND batch.SourceByteLength = @SourceByteLength
        AND batch.ImportedProfileCount = @ExpectedProfileCount
        AND batch.ImportedResultRowCount = @ExpectedRawResultRowCount
    )
    BEGIN
      THROW 51209, 'The existing source hash has different metadata.', 1;
    END;

    SELECT
      @ExistingImportBatchId AS importBatchId,
      CAST(0 AS BIT) AS imported,
      @ExpectedProfileCount AS profileCount,
      @ExpectedRawResultRowCount AS rawResultRowCount,
      @ExpectedCanonicalResultCount AS canonicalResultCount,
      (
        SELECT COUNT(*)
        FROM dbo.BrokerGeneProfileSnapshots AS profile
        WHERE profile.ImportBatchId = @ExistingImportBatchId
          AND profile.ReportStatus = 'ready'
      ) AS readyProfileCount,
      (
        SELECT COUNT(*)
        FROM dbo.BrokerGeneProfileSnapshots AS profile
        WHERE profile.ImportBatchId = @ExistingImportBatchId
          AND profile.ReportStatus = 'partial'
      ) AS partialProfileCount;
    RETURN;
  END;

  DECLARE @ImportBatchId BIGINT;
  DECLARE @EffectiveTimestampUtc DATETIME2(0) =
    COALESCE(@SourceTimestampUtc, SYSUTCDATETIME());

  BEGIN TRY
    BEGIN TRANSACTION;

    INSERT dbo.BrokerGeneImportBatches
    (
      SourceFileSha256,
      SourceFileName,
      SourceByteLength,
      WorkbookSchemaVersion,
      ImporterVersion,
      ImportedProfileCount,
      ImportedResultRowCount,
      ImportedAtUtc
    )
    VALUES
    (
      @SourceFileSha256,
      @SourceFileName,
      @SourceByteLength,
      N'swab-rs-v1',
      N'broker-gene-import-v1',
      @ExpectedProfileCount,
      @ExpectedRawResultRowCount,
      @EffectiveTimestampUtc
    );

    SET @ImportBatchId = SCOPE_IDENTITY();

    INSERT dbo.BrokerGeneProfileSnapshots
    (
      ImportBatchId,
      IntelligeneNumber,
      ReportAccessStatus,
      ReportStatus,
      SexAtBirth,
      DateOfBirth,
      SampleId,
      AssayName,
      AssayVersion,
      AssayStrand,
      ExpectedVariantCount,
      ObservedVariantCount,
      ProcessedAtUtc,
      SourceSheetName,
      SourceRowNumber
    )
    SELECT
      @ImportBatchId,
      profile.IntelligeneNumber,
      'enabled',
      CASE
        WHEN profile.ObservedVariantCount =
          @ExpectedVariantCountPerReadyProfile
          THEN 'ready'
        ELSE 'partial'
      END,
      profile.SexAtBirth,
      NULL,
      profile.IntelligeneNumber,
      @AssayName,
      @AssayVersion,
      @AssayStrand,
      @ExpectedVariantCountPerReadyProfile,
      profile.ObservedVariantCount,
      @EffectiveTimestampUtc,
      N'Sheet1',
      profile.SourceRowNumber
    FROM #Profiles AS profile;

    ;WITH RankedRows AS
    (
      SELECT
        source_row.*,
        ROW_NUMBER() OVER
        (
          PARTITION BY
            source_row.IntelligeneNumber,
            source_row.VariantId
          ORDER BY source_row.SourceRowNumber
        ) AS occurrence
      FROM #Rows AS source_row
    )
    INSERT dbo.BrokerGeneResultCalls
    (
      ProfileId,
      SourceSheetName,
      SourceRowNumber,
      SourceColumnNumber,
      SourceColumnName,
      RawGene,
      RawVariantId,
      RawValue,
      RawSourceRowJson,
      VariantId,
      NormalizedValue,
      Quality,
      IsCanonical,
      DuplicateReason
    )
    SELECT
      profile.ProfileId,
      N'Sheet1',
      source_row.SourceRowNumber,
      4,
      N'result',
      source_row.RawGene,
      source_row.RawVariantId,
      source_row.RawValue,
      source_row.RawSourceRowJson,
      source_row.VariantId,
      source_row.NormalizedValue,
      NULL,
      CASE WHEN source_row.occurrence = 1 THEN 1 ELSE 0 END,
      CASE
        WHEN source_row.occurrence = 1 THEN NULL
        ELSE N'duplicate-identical'
      END
    FROM RankedRows AS source_row
    INNER JOIN dbo.BrokerGeneProfileSnapshots AS profile
      ON profile.ImportBatchId = @ImportBatchId
      AND profile.IntelligeneNumber = source_row.IntelligeneNumber;

    IF
    (
      SELECT COUNT_BIG(*)
      FROM dbo.BrokerGeneResultCalls AS result_call
      INNER JOIN dbo.BrokerGeneProfileSnapshots AS profile
        ON profile.ProfileId = result_call.ProfileId
      WHERE profile.ImportBatchId = @ImportBatchId
    ) <> @ExpectedRawResultRowCount
    BEGIN
      THROW 51210, 'The persisted raw result count is invalid.', 1;
    END;

    IF
    (
      SELECT COUNT_BIG(*)
      FROM dbo.BrokerGeneResultCalls AS result_call
      INNER JOIN dbo.BrokerGeneProfileSnapshots AS profile
        ON profile.ProfileId = result_call.ProfileId
      WHERE profile.ImportBatchId = @ImportBatchId
        AND result_call.IsCanonical = 1
    ) <> @ExpectedCanonicalResultCount
    BEGIN
      THROW 51211, 'The persisted canonical result count is invalid.', 1;
    END;

    UPDATE current_profile
    SET
      ProfileId = imported_profile.ProfileId,
      SelectedAtUtc = @EffectiveTimestampUtc
    FROM dbo.BrokerGeneCurrentProfiles AS current_profile
    INNER JOIN dbo.BrokerGeneProfileSnapshots AS imported_profile
      ON imported_profile.ImportBatchId = @ImportBatchId
      AND imported_profile.IntelligeneNumber =
        current_profile.IntelligeneNumber;

    INSERT dbo.BrokerGeneCurrentProfiles
    (
      IntelligeneNumber,
      ProfileId,
      SelectedAtUtc
    )
    SELECT
      imported_profile.IntelligeneNumber,
      imported_profile.ProfileId,
      @EffectiveTimestampUtc
    FROM dbo.BrokerGeneProfileSnapshots AS imported_profile
    WHERE imported_profile.ImportBatchId = @ImportBatchId
      AND NOT EXISTS
      (
        SELECT 1
        FROM dbo.BrokerGeneCurrentProfiles AS current_profile
        WHERE current_profile.IntelligeneNumber =
          imported_profile.IntelligeneNumber
      );

    IF @ImportScope = 'full'
    BEGIN
      UPDATE current_snapshot
      SET ReportAccessStatus = 'disabled'
      FROM dbo.BrokerGeneCurrentProfiles AS current_profile
      INNER JOIN dbo.BrokerGeneProfileSnapshots AS current_snapshot
        ON current_snapshot.ProfileId = current_profile.ProfileId
      WHERE NOT EXISTS
      (
        SELECT 1
        FROM dbo.BrokerGeneProfileSnapshots AS imported_profile
        WHERE imported_profile.ImportBatchId = @ImportBatchId
          AND imported_profile.IntelligeneNumber =
            current_profile.IntelligeneNumber
      );
    END;

    COMMIT TRANSACTION;
  END TRY
  BEGIN CATCH
    IF @@TRANCOUNT > 0
      ROLLBACK TRANSACTION;
    THROW;
  END CATCH;

  SELECT
    @ImportBatchId AS importBatchId,
    CAST(1 AS BIT) AS imported,
    @ExpectedProfileCount AS profileCount,
    @ExpectedRawResultRowCount AS rawResultRowCount,
    @ExpectedCanonicalResultCount AS canonicalResultCount,
    (
      SELECT COUNT(*)
      FROM dbo.BrokerGeneProfileSnapshots AS profile
      WHERE profile.ImportBatchId = @ImportBatchId
        AND profile.ReportStatus = 'ready'
    ) AS readyProfileCount,
    (
      SELECT COUNT(*)
      FROM dbo.BrokerGeneProfileSnapshots AS profile
      WHERE profile.ImportBatchId = @ImportBatchId
        AND profile.ReportStatus = 'partial'
    ) AS partialProfileCount;
END;
GO
