import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

const mockSignInAction = vi.mocked(signInAction);
const mockSignUpAction = vi.mocked(signUpAction);
const mockGetAnonWorkData = vi.mocked(getAnonWorkData);
const mockClearAnonWork = vi.mocked(clearAnonWork);
const mockGetProjects = vi.mocked(getProjects);
const mockCreateProject = vi.mocked(createProject);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAnonWorkData.mockReturnValue(null);
  mockGetProjects.mockResolvedValue([]);
  mockCreateProject.mockResolvedValue({ id: "new-project-id" } as any);
});

describe("useAuth", () => {
  describe("initial state", () => {
    it("returns isLoading as false initially", () => {
      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(false);
    });

    it("exposes signIn and signUp functions", () => {
      const { result } = renderHook(() => useAuth());
      expect(typeof result.current.signIn).toBe("function");
      expect(typeof result.current.signUp).toBe("function");
    });
  });

  describe("signIn", () => {
    describe("happy path — success with anon work", () => {
      it("creates a project from anon work, clears it, and redirects", async () => {
        const anonWork = {
          messages: [{ role: "user", content: "hello" }],
          fileSystemData: { "/": { type: "directory" } },
        };
        mockGetAnonWorkData.mockReturnValue(anonWork);
        mockSignInAction.mockResolvedValue({ success: true });
        mockCreateProject.mockResolvedValue({ id: "anon-project-123" } as any);

        const { result } = renderHook(() => useAuth());
        let returnValue: any;

        await act(async () => {
          returnValue = await result.current.signIn("user@example.com", "password123");
        });

        expect(mockSignInAction).toHaveBeenCalledWith("user@example.com", "password123");
        expect(mockCreateProject).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: anonWork.messages,
            data: anonWork.fileSystemData,
          })
        );
        expect(mockClearAnonWork).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/anon-project-123");
        expect(mockGetProjects).not.toHaveBeenCalled();
        expect(returnValue).toEqual({ success: true });
      });
    });

    describe("happy path — success with existing projects", () => {
      it("redirects to the most recent project when no anon work exists", async () => {
        mockGetAnonWorkData.mockReturnValue(null);
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetProjects.mockResolvedValue([
          { id: "project-1", name: "First", createdAt: new Date(), updatedAt: new Date() },
          { id: "project-2", name: "Second", createdAt: new Date(), updatedAt: new Date() },
        ] as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@example.com", "password123");
        });

        expect(mockGetProjects).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/project-1");
        expect(mockCreateProject).not.toHaveBeenCalled();
      });
    });

    describe("happy path — success with no projects", () => {
      it("creates a new project and redirects when no anon work and no existing projects", async () => {
        mockGetAnonWorkData.mockReturnValue(null);
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetProjects.mockResolvedValue([]);
        mockCreateProject.mockResolvedValue({ id: "brand-new-project" } as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@example.com", "password123");
        });

        expect(mockCreateProject).toHaveBeenCalledWith(
          expect.objectContaining({ messages: [], data: {} })
        );
        expect(mockPush).toHaveBeenCalledWith("/brand-new-project");
      });
    });

    describe("edge case — anon work with empty messages", () => {
      it("falls through to existing projects when anon work has no messages", async () => {
        mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetProjects.mockResolvedValue([
          { id: "existing-project", name: "Old", createdAt: new Date(), updatedAt: new Date() },
        ] as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@example.com", "password123");
        });

        expect(mockGetProjects).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/existing-project");
        expect(mockClearAnonWork).not.toHaveBeenCalled();
      });
    });

    describe("error state — failed sign in", () => {
      it("returns the failure result and does not redirect", async () => {
        mockSignInAction.mockResolvedValue({ success: false, error: "Invalid credentials" });

        const { result } = renderHook(() => useAuth());
        let returnValue: any;

        await act(async () => {
          returnValue = await result.current.signIn("bad@example.com", "wrongpass");
        });

        expect(returnValue).toEqual({ success: false, error: "Invalid credentials" });
        expect(mockPush).not.toHaveBeenCalled();
        expect(mockCreateProject).not.toHaveBeenCalled();
      });
    });

    describe("isLoading state", () => {
      it("sets isLoading to true during signIn and false after", async () => {
        let loadingDuringCall = false;
        mockSignInAction.mockImplementation(async () => {
          loadingDuringCall = true;
          return { success: false, error: "err" };
        });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signIn("user@example.com", "password123");
        });

        expect(loadingDuringCall).toBe(true);
        expect(result.current.isLoading).toBe(false);
      });

      it("resets isLoading to false even when signIn throws", async () => {
        mockSignInAction.mockRejectedValue(new Error("Network error"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          try {
            await result.current.signIn("user@example.com", "password123");
          } catch {
            // expected
          }
        });

        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe("signUp", () => {
    describe("happy path — success with anon work", () => {
      it("creates a project from anon work, clears it, and redirects", async () => {
        const anonWork = {
          messages: [{ role: "user", content: "build me a button" }],
          fileSystemData: { "/": { type: "directory" }, "/App.jsx": { content: "<div/>" } },
        };
        mockGetAnonWorkData.mockReturnValue(anonWork);
        mockSignUpAction.mockResolvedValue({ success: true });
        mockCreateProject.mockResolvedValue({ id: "signup-project-456" } as any);

        const { result } = renderHook(() => useAuth());
        let returnValue: any;

        await act(async () => {
          returnValue = await result.current.signUp("new@example.com", "securepass");
        });

        expect(mockSignUpAction).toHaveBeenCalledWith("new@example.com", "securepass");
        expect(mockCreateProject).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: anonWork.messages,
            data: anonWork.fileSystemData,
          })
        );
        expect(mockClearAnonWork).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/signup-project-456");
        expect(returnValue).toEqual({ success: true });
      });
    });

    describe("happy path — success with no prior work", () => {
      it("creates a new empty project and redirects", async () => {
        mockGetAnonWorkData.mockReturnValue(null);
        mockSignUpAction.mockResolvedValue({ success: true });
        mockGetProjects.mockResolvedValue([]);
        mockCreateProject.mockResolvedValue({ id: "fresh-project" } as any);

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("new@example.com", "securepass");
        });

        expect(mockCreateProject).toHaveBeenCalledWith(
          expect.objectContaining({ messages: [], data: {} })
        );
        expect(mockPush).toHaveBeenCalledWith("/fresh-project");
      });
    });

    describe("error state — failed sign up", () => {
      it("returns the failure result and does not redirect", async () => {
        mockSignUpAction.mockResolvedValue({ success: false, error: "Email already registered" });

        const { result } = renderHook(() => useAuth());
        let returnValue: any;

        await act(async () => {
          returnValue = await result.current.signUp("existing@example.com", "password123");
        });

        expect(returnValue).toEqual({ success: false, error: "Email already registered" });
        expect(mockPush).not.toHaveBeenCalled();
      });
    });

    describe("isLoading state", () => {
      it("resets isLoading to false after successful signUp", async () => {
        mockSignUpAction.mockResolvedValue({ success: false, error: "err" });

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          await result.current.signUp("user@example.com", "password123");
        });

        expect(result.current.isLoading).toBe(false);
      });

      it("resets isLoading to false even when signUp throws", async () => {
        mockSignUpAction.mockRejectedValue(new Error("Server down"));

        const { result } = renderHook(() => useAuth());

        await act(async () => {
          try {
            await result.current.signUp("user@example.com", "password123");
          } catch {
            // expected
          }
        });

        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe("createProject name generation", () => {
    it("names the anon-work project with a time-based label", async () => {
      mockGetAnonWorkData.mockReturnValue({
        messages: [{ role: "user", content: "test" }],
        fileSystemData: {},
      });
      mockSignInAction.mockResolvedValue({ success: true });
      mockCreateProject.mockResolvedValue({ id: "x" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("u@example.com", "pass");
      });

      const callArg = mockCreateProject.mock.calls[0][0];
      expect(callArg.name).toMatch(/^Design from /);
    });

    it("names the new empty project with a numeric suffix", async () => {
      mockGetAnonWorkData.mockReturnValue(null);
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({ id: "x" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("u@example.com", "pass");
      });

      const callArg = mockCreateProject.mock.calls[0][0];
      expect(callArg.name).toMatch(/^New Design #\d+$/);
    });
  });
});
