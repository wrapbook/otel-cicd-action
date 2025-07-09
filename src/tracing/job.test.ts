import { mock } from "jest-mock-extended";
import * as core from "@actions/core";
import { traceWorkflowRunJobs } from "./job";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { WorkflowRunJobs } from "../github";
import { getOctokit } from "@actions/github";

// Mock dependencies
jest.mock("@actions/core");
jest.mock("@actions/github", () => ({
  getOctokit: jest.fn(),
  context: {
    repo: {
      owner: "test-owner",
      repo: "test-repo",
    },
  },
}));

describe("traceWorkflowRunJobs", () => {
  let mockProvider: BasicTracerProvider;
  let mockWorkflowRunJobs: WorkflowRunJobs;
  let mockOctokit: {
    rest: {
      checks: {
        listAnnotations: jest.Mock;
      };
      issues: {
        listLabelsOnIssue: jest.Mock;
      };
    };
  };

  beforeEach(() => {
    jest.resetAllMocks();

    // Mock provider
    mockProvider = mock<BasicTracerProvider>({
      getTracer: jest.fn().mockReturnValue({
        startSpan: jest.fn().mockReturnValue({
          spanContext: jest.fn().mockReturnValue({
            traceId: "test-trace-id",
            spanId: "test-span-id",
          }),
          setStatus: jest.fn(),
          end: jest.fn(),
        }),
      }),
    });
    // GitHub context is mocked in the jest.mock call

    mockOctokit = {
      rest: {
        checks: {
          listAnnotations: jest.fn().mockResolvedValue({
            data: [],
          }),
        },
        issues: {
          listLabelsOnIssue: jest.fn().mockResolvedValue({
            data: [],
          }),
        },
      },
    };

    // Mock GitHub getOctokit
    (getOctokit as jest.Mock).mockReturnValue(mockOctokit);

    // Mock core.getInput and other core functions
    (core.getInput as jest.Mock).mockReturnValue("mock-token");
    (core.getBooleanInput as jest.Mock).mockReturnValue(false);
    (core.debug as jest.Mock).mockImplementation(jest.fn());
    (core.info as jest.Mock).mockImplementation(jest.fn());

    // Create a mock workflow run jobs object
    mockWorkflowRunJobs = mock<WorkflowRunJobs>({
      workflowRun: {
        id: 123,
        name: "Test Workflow",
        workflow_id: 456,
        run_number: 1,
        run_attempt: 1,
        html_url: "https://github.com/test-owner/test-repo/actions/runs/123",
        workflow_url:
          "https://github.com/test-owner/test-repo/actions/workflows/456",
        event: "push",
        conclusion: null,
        created_at: "2023-01-01T00:00:00Z",
        updated_at: "2023-01-01T00:10:00Z",
        run_started_at: "2023-01-01T00:00:00Z",
        head_sha: "abcdef123456",
        head_branch: "main",
      },
      jobs: [
        {
          id: 789,
          name: "Test Job",
          run_id: 123,
          run_url: "https://github.com/test-owner/test-repo/actions/runs/123",
          node_id: "node123",
          head_sha: "abcdef123456",
          url: "https://api.github.com/repos/test-owner/test-repo/actions/jobs/789",
          html_url:
            "https://github.com/test-owner/test-repo/actions/runs/123/jobs/789",
          status: "completed",
          conclusion: "failure",
          started_at: "2023-01-01T00:00:00Z",
          completed_at: "2023-01-01T00:10:00Z",
          runner_name: "test-runner",
          runner_group_id: 1,
          runner_group_name: "Default",
          steps: [],
          labels: ["ubuntu-latest"],
        },
      ],
      workflowRunArtifacts: jest.fn(),
    });
  });

  describe("annotation filtering", () => {
    it("should filter failure annotations to only include those from .github path", async () => {
      // Setup the mock annotations response
      const mockAnnotations = [
        {
          path: ".github",
          start_line: 1,
          end_line: 1,
          start_column: null,
          end_column: null,
          annotation_level: "failure",
          title: null,
          message: "Failure from GitHub workflow",
          raw_details: null,
          blob_href:
            "https://github.com/test-owner/test-repo/blob/abcdef/.github/file.yml",
        },
        {
          path: "src/app",
          start_line: 1,
          end_line: 1,
          start_column: null,
          end_column: null,
          annotation_level: "failure",
          title: null,
          message: "Failure from application code",
          raw_details: null,
          blob_href:
            "https://github.com/test-owner/test-repo/blob/abcdef/src/app/file.js",
        },
      ];

      // Configure the mock to return our annotations
      mockOctokit.rest.checks.listAnnotations.mockResolvedValueOnce({
        data: mockAnnotations,
      });

      // Call the function
      await traceWorkflowRunJobs({
        provider: mockProvider,
        workflowRunJobs: mockWorkflowRunJobs,
      });

      // Verify that only the GitHub failure was included
      expect(mockOctokit.rest.checks.listAnnotations).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        check_run_id: 789,
      });
    });

    it("should include all notice annotations regardless of path", async () => {
      // Setup the mock annotations response with both failure and notice annotations
      const mockAnnotations = [
        {
          path: ".github",
          start_line: 1,
          end_line: 1,
          start_column: null,
          end_column: null,
          annotation_level: "failure",
          title: null,
          message: "Failure from GitHub workflow",
          raw_details: null,
          blob_href:
            "https://github.com/test-owner/test-repo/blob/abcdef/.github/file.yml",
        },
        {
          path: "src/app",
          start_line: 1,
          end_line: 1,
          start_column: null,
          end_column: null,
          annotation_level: "failure",
          title: null,
          message: "Failure from application code",
          raw_details: null,
          blob_href:
            "https://github.com/test-owner/test-repo/blob/abcdef/src/app/file.js",
        },
        {
          path: ".github",
          start_line: 1,
          end_line: 1,
          start_column: null,
          end_column: null,
          annotation_level: "notice",
          title: null,
          message: "Notice from GitHub workflow",
          raw_details: null,
          blob_href:
            "https://github.com/test-owner/test-repo/blob/abcdef/.github/file.yml",
        },
        {
          path: "src/app",
          start_line: 1,
          end_line: 1,
          start_column: null,
          end_column: null,
          annotation_level: "notice",
          title: null,
          message: "Notice from application code",
          raw_details: null,
          blob_href:
            "https://github.com/test-owner/test-repo/blob/abcdef/src/app/file.js",
        },
      ];

      // Configure the mock to return our annotations
      mockOctokit.rest.checks.listAnnotations.mockResolvedValueOnce({
        data: mockAnnotations,
      });

      // Call the function
      await traceWorkflowRunJobs({
        provider: mockProvider,
        workflowRunJobs: mockWorkflowRunJobs,
      });

      // Verify that correct annotations were included (failures from .github + all notices)
      expect(mockOctokit.rest.checks.listAnnotations).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        check_run_id: 789,
      });
    });
  });
});
