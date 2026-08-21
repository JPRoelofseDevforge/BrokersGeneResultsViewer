/*
  Runtime identity projection upgrade

  Apply after 001_broker_gene_results.sql. This migration is rerunnable and
  changes only the two profile read procedures. It projects the recipient's
  existing display name while continuing to keep their email private and to
  expose no direct table permissions to the App Service identity.
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
  THROW 51300, 'Run this migration outside an existing transaction.', 1;

IF OBJECT_ID(N'dbo.BrokerDayReportRecipients', N'U') IS NULL
   OR OBJECT_ID(N'dbo.BrokerGeneProfileSnapshots', N'U') IS NULL
   OR OBJECT_ID(N'dbo.BrokerGeneCurrentProfiles', N'U') IS NULL
   OR OBJECT_ID(N'dbo.BrokerGeneResultCalls', N'U') IS NULL
BEGIN
  THROW 51301, 'Run the broker gene repository migration first.', 1;
END;

IF COL_LENGTH(N'dbo.BrokerDayReportRecipients', N'Name') IS NULL
  THROW 51302, 'BrokerDayReportRecipients.Name is missing.', 1;

IF COL_LENGTH(N'dbo.BrokerDayReportRecipients', N'Email') IS NULL
   OR COL_LENGTH(
        N'dbo.BrokerDayReportRecipients',
        N'IntelligeneNumber'
      ) IS NULL
BEGIN
  THROW 51303, 'The recipient identity mapping is incomplete.', 1;
END;

IF DATABASE_PRINCIPAL_ID(N'broker_gene_report_executor') IS NULL
  THROW 51304, 'The broker gene report executor role is missing.', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  /*
    Resolve exactly one distinct Intelligene number for the normalized email.
    The procedure returns the matched recipient's display name, never email.
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
    recipient.[Name] AS displayName,
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
  INNER JOIN dbo.BrokerDayReportRecipients AS recipient
    ON recipient.IntelligeneNumber = resolved.IntelligeneNumber
    AND LOWER(LTRIM(RTRIM(recipient.Email))) = @NormalizedEmail
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
    The number lookup uses the same exact recipient mapping and display-name
    projection. It cannot expose workbook-only profiles.
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
    recipient.[Name] AS displayName,
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
  INNER JOIN dbo.BrokerDayReportRecipients AS recipient
    ON recipient.IntelligeneNumber = p.IntelligeneNumber
  WHERE current_profile.IntelligeneNumber = @NormalizedNumber
    AND p.ReportAccessStatus = ''enabled''
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

  GRANT EXECUTE
    ON OBJECT::dbo.usp_BrokerGene_GetProfileByEmail
    TO broker_gene_report_executor;
  GRANT EXECUTE
    ON OBJECT::dbo.usp_BrokerGene_GetProfileByNumber
    TO broker_gene_report_executor;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;
