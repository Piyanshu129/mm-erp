"use client";

import { useEffect, useState } from "react";
import { Camera, LogOut, MapPin, CheckCircle2, UserCog, X } from "lucide-react";
import { RequireEmployeeAuth } from "@/components/RequireEmployeeAuth";
import { useEmployeePortalAuth } from "@/context/EmployeePortalAuthContext";
import { employeeApiFetch } from "@/lib/employeePortalApi";
import { AuthedImage } from "@/components/AuthedMedia";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

interface TodayAttendance {
  status: string;
  punchedAt: string | null;
  latitude: string | null;
  longitude: string | null;
  selfieUrl: string | null;
  markedBy: string;
}

interface MonthlySummary {
  presentDays: number;
  absentDays: number;
  leaveDays: number;
}

function describeGeoError(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as GeolocationPositionError).code;
    if (code === 1) return "Location permission was denied. Please allow location access in your browser and try again.";
    if (code === 2) return "Could not determine your location. Please try again.";
    if (code === 3) return "Location request timed out. Please try again.";
  }
  return err instanceof Error ? err.message : "Could not get your location.";
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not supported on this device or browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 });
  });
}

function PortalContent() {
  const { employee, logout } = useEmployeePortalAuth();
  const [today, setToday] = useState<TodayAttendance | null>(null);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [punching, setPunching] = useState(false);
  const [punchError, setPunchError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const now = new Date();
    const [todayBody, summaryBody] = await Promise.all([
      employeeApiFetch("/employee-portal/attendance/today"),
      employeeApiFetch(`/employee-portal/attendance/summary?month=${now.getMonth() + 1}&year=${now.getFullYear()}`),
    ]);
    setToday(todayBody.attendance);
    setSummary(summaryBody);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function chooseSelfie(file: File | null) {
    setSelfieFile(file);
    if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    setSelfiePreview(file ? URL.createObjectURL(file) : null);
  }

  async function handlePunch() {
    setPunchError(null);
    setPunching(true);
    try {
      const position = await getPosition();
      const formData = new FormData();
      formData.set("latitude", String(position.coords.latitude));
      formData.set("longitude", String(position.coords.longitude));
      if (selfieFile) formData.set("selfie", selfieFile);
      await employeeApiFetch("/employee-portal/attendance/punch", { method: "POST", body: formData });
      chooseSelfie(null);
      await load();
    } catch (err) {
      setPunchError(err instanceof ApiError ? err.message : describeGeoError(err));
    } finally {
      setPunching(false);
    }
  }

  const alreadyPunched = today?.punchedAt != null;

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <UserCog className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{employee?.name}</p>
            <p className="text-xs text-gray-500">{employee?.role ?? "Employee"}</p>
          </div>
        </div>
        <button onClick={logout} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-5">
          <Card>
            <CardBody className="text-center">
              <p className="mb-3 text-sm font-medium text-gray-500">
                {new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </p>

              {alreadyPunched ? (
                <div className="space-y-3">
                  <div className="flex flex-col items-center gap-2 text-green-700">
                    <CheckCircle2 className="h-10 w-10" />
                    <p className="text-base font-semibold">You&apos;re marked Present today</p>
                    <p className="text-sm text-gray-500">
                      Punched in at {new Date(today!.punchedAt!).toLocaleTimeString()}
                    </p>
                  </div>
                  {today?.latitude && today?.longitude && (
                    <p className="flex items-center justify-center gap-1 text-xs text-gray-400">
                      <MapPin className="h-3 w-3" /> Location recorded
                    </p>
                  )}
                  {today?.selfieUrl && (
                    <AuthedImage
                      src={today.selfieUrl}
                      alt="Attendance selfie"
                      className="mx-auto h-24 w-24 rounded-full border border-gray-200 object-cover"
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">Tap below to mark your attendance for today.</p>

                  <div className="flex flex-col items-center gap-2">
                    {selfiePreview ? (
                      <div className="relative">
                        <img src={selfiePreview} alt="Selfie preview" className="h-24 w-24 rounded-full object-cover" />
                        <button
                          onClick={() => chooseSelfie(null)}
                          className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-red-600 shadow ring-1 ring-gray-200"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-full border-2 border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-500">
                        <Camera className="h-6 w-6" />
                        <span className="text-[10px]">Selfie</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="user"
                          className="hidden"
                          onChange={(e) => chooseSelfie(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    )}
                    <p className="text-xs text-gray-400">Selfie is optional</p>
                  </div>

                  {punchError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{punchError}</p>}

                  <Button onClick={handlePunch} disabled={punching} className="w-full justify-center py-3 text-base">
                    <MapPin className="h-4 w-4" /> {punching ? "Getting your location..." : "Punch Attendance"}
                  </Button>
                  <p className="text-xs text-gray-400">
                    This will ask permission to use your location, recorded along with the time you punched.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          {summary && (
            <Card>
              <CardBody>
                <p className="mb-3 text-sm font-semibold text-gray-900">This month</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-semibold text-green-700">{summary.presentDays}</p>
                    <p className="text-xs text-gray-500">Present</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-red-600">{summary.absentDays}</p>
                    <p className="text-xs text-gray-500">Absent</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-amber-600">{summary.leaveDays}</p>
                    <p className="text-xs text-gray-500">Leave</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default function EmployeePortalPage() {
  return (
    <RequireEmployeeAuth>
      <PortalContent />
    </RequireEmployeeAuth>
  );
}
