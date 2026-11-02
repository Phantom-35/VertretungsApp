"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ClassSelector, ViewingOtherNote } from "@/components/ClassSelector";
import { DAY_PANEL_ID, DaySelector, dayTabId } from "@/components/DaySelector";
import { DaySummary } from "@/components/DaySummary";
import { DesktopView } from "@/components/DesktopView";
import { Header, type HeaderStatus } from "@/components/Header";
import { HolidayCard } from "@/components/HolidayCard";
import { LoadingState } from "@/components/LoadingState";
import { NoticesCard } from "@/components/NoticesCard";
import { PullToRefresh } from "@/components/PullToRefresh";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { RefreshStatus } from "@/components/RefreshStatus";
import { ShareButton } from "@/components/ShareButton";
import { SubstitutionCard } from "@/components/SubstitutionCard";
import { InstallReminder } from "@/components/InstallReminder";
import { RoomPlanIntro } from "@/components/RoomPlanIntro";
import { RoomPlanSheet } from "@/components/RoomPlanSheet";
import { NotificationSettings } from "@/components/NotificationSettings";
import { Onboarding } from "@/components/Onboarding";
import { TeacherHint } from "@/components/TeacherFilter";
import { SettingsSheet, type SettingsFocus } from "@/components/SettingsSheet";
import { acknowledgeNewEntry, useAcknowledgedEntries, useSeenBaseline } from "@/hooks/useNewEntries";
import { useNow, useOpened } from "@/hooks/useNow";
import { useOnboarding } from "@/hooks/useOnboarding";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useMyClass, useViewedClass } from "@/hooks/useSelectedClass";
import { useSettings } from "@/hooks/useSettings";
import { useStoredList } from "@/hooks/useStoredList";
import { useSubstitutionData } from "@/hooks/useSubstitutionData";
import { useWideScreen } from "@/hooks/useWideScreen";
import {
  SCHOOL_CLASSES,
  compareEntries,
  classlessEntryFor,
  entryAppliesToClass,
  entryMatchesTeachers,
  formatClassName,
  isCourseClass,
  normalizeSelectedClass,
  normalizeTeacher,
} from "@/lib/entries";
import { formatAge, formatPlanDateLabel, formatShortDate, formatTimestamp, formatWeekday, isPastDate } from "@/lib/format";
import { addressRequest, clearAddressRequest, dayFromUrl } from "@/lib/address";
import { freeUntil, holidayBreakAt, nextSchoolDay, publicHolidayName } from "@/lib/holidays";
import { firstKnownRoom } from "@/lib/rooms";
import { entryKey, findNewKeys } from "@/lib/seen";
import { buildShareText, classLink } from "@/lib/share";
import { NEXT_DAY_FROM_HOUR, daysBetween, isLessonOver, pickDefaultDate, schoolHour, schoolToday } from "@/lib/time";
import type { PlanDay, SubstitutionPayload } from "@/lib/types";

type SubstitutionAppProps = {
  initialData: SubstitutionPayload | null;
  /** Day to show first, e.g. when opened from a notification. */
  initialDay?: string | null;
};

const noSubscribe = () => () => undefined;
// What the address asked for when the app opened (read once, see lib/address.ts).
const dayInAddress = () => addressRequest().day;
/** "?einstellungen=teilen": back from the notice to print, to the code in the settings. */
const settingsInAddress = () => addressRequest().settings;

/** Last check older than this (while online): shown in the warning colour. */
const CHECK_STALE_MS = 30 * 60_000;

/** From this many changes on a day, the cards are shown smaller. */
const COMPACT_FROM = 6;

const cardClassName =
  "rounded-[1.75rem] border border-line bg-card p-6 text-center shadow-[0_18px_45px_rgba(18,41,39,0.07)]";

function EmptyDay({
  selectedClass,
  dayLabel,
  filtered,
  getShareText,
}: {
  selectedClass: string;
  dayLabel: string;
  /** Only the student's own courses are shown. */
  filtered: boolean;
  getShareText: () => string;
}) {
  return (
    <div className={cardClassName}>
      <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
        Keine Änderungen
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">
        {dayLabel} sind {filtered ? `für deine Kurse in der ${selectedClass}` : `für die ${selectedClass}`}{" "}
        keine Änderungen eingetragen.
      </p>
      <div className="mt-4 flex justify-center">
        <ShareButton getText={getShareText} size="large" />
      </div>
    </div>
  );
}

export function SubstitutionApp({ initialData, initialDay = null }: SubstitutionAppProps) {
  const { data, fromDevice, status, connectionError, schoolDown, refresh } =
    useSubstitutionData(initialData);
  // The student's own class (opens with it, notifications are about it) and
  // another class only looked at until the app is closed.
  const [myClass, setMyClass] = useMyClass();
  const [viewedClass, setViewedClass] = useViewedClass();
  const selectedClass = viewedClass ?? myClass;
  const courseFilterKey = `kag:teachers:${selectedClass ?? ""}`;
  const [storedTeachers, setTeachers] = useStoredList(courseFilterKey);
  const [myStoredTeachers, setMyTeachers] = useStoredList(`kag:teachers:${myClass ?? ""}`);
  const myTeachers = myClass && isCourseClass(myClass) ? myStoredTeachers : [];
  const [showOtherCourses, setShowOtherCourses] = useState(false);
  const now = useNow();
  const seenBaseline = useSeenBaseline(data);
  const acknowledgedNew = useAcknowledgedEntries();
  const [settings] = useSettings();
  const push = usePushNotifications({
    schoolClass: myClass ?? null,
    teachers: myTeachers,
    notifyGroups: settings.notifyGroups,
    eveningSummary: settings.eveningSummary,
    morningSummary: settings.morningSummary,
    eveningSummaryTime: settings.eveningSummaryTime,
    morningSummaryTime: settings.morningSummaryTime,
  });
  const onboarding = useOnboarding();
  // The introduction was on screen during this visit.
  const [introducedNow, setIntroducedNow] = useState(false);
  if (!onboarding.done && !introducedNow) {
    setIntroducedNow(true);
  }
  // Computer or tablet in landscape: a view of its own (phones never get it).
  const wide = useWideScreen();
  // The sections glide in when the app opens, not when one appears later.
  const [opening, setOpening] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setOpening(false), 1_200);
    return () => window.clearTimeout(timer);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsFocus, setSettingsFocus] = useState<SettingsFocus>(null);
  // Opened at the code by the address, until closed (or opened otherwise).
  const shareInAddress = useSyncExternalStore(noSubscribe, settingsInAddress, () => null) === "teilen";
  const [addressHandled, setAddressHandled] = useState(false);
  // Once closed (or the settings opened otherwise), it no longer applies.
  const opensFromAddress = shareInAddress && !addressHandled;
  // Read at this opening; then out of the address, so that a reload (also
  // the one for a new version) does not jump to that day or open the
  // settings again.
  useEffect(() => {
    clearAddressRequest();
  }, []);
  // A shared plan's link ("?klasse=7B"): without an own class yet it becomes
  // the own class (someone new to the app), otherwise it is only looked at
  // (e.g. parents opening their child's class). Once the class is known.
  const classFromLink = useRef(true);
  useEffect(() => {
    if (myClass === undefined || !classFromLink.current) {
      return;
    }
    classFromLink.current = false;
    const linked = addressRequest().schoolClass;
    const schoolClass = linked ? normalizeSelectedClass(linked) : null;
    if (!schoolClass) {
      return;
    }
    if (!myClass) {
      setMyClass(schoolClass);
    } else if (schoolClass !== myClass) {
      setViewedClass(schoolClass);
    }
  }, [myClass, setMyClass, setViewedClass]);
  const openSettings = (focus: SettingsFocus = null) => {
    setAddressHandled(true);
    setSettingsFocus(focus);
    setSettingsOpen(true);
  };

  const usesCourseFilter = Boolean(selectedClass && isCourseClass(selectedClass));
  const teachers = usesCourseFilter ? storedTeachers : [];

  const chooseClass = (value: string) => {
    setShowOtherCourses(false);
    if (!myClass) {
      // Nothing chosen as own class yet: the first class picked becomes it.
      setMyClass(value);
      setViewedClass(null);
    } else {
      setViewedClass(value === myClass ? null : value);
    }
  };
  const chooseMyClass = (value: string) => {
    setShowOtherCourses(false);
    setMyClass(value);
    setViewedClass(null);
  };

  const forceRefresh = useCallback(() => refresh(true), [refresh]);
  const isBusy = status !== "idle";

  // A day tapped by the user (or in a notification while the app is open),
  // with the opening it was chosen in: opened again (after more than a quick
  // look elsewhere, or on a new day), the app starts at today again.
  const [chosen, setChosen] = useState<{ date: string; at: number | null } | null>(null);
  const opened = useOpened();
  const openedDay = opened !== null ? schoolToday(opened.last) : null;
  const openedAtRef = useRef(opened?.last ?? null);
  useEffect(() => {
    openedAtRef.current = opened?.last ?? null;
  }, [opened]);
  const chooseDate = useCallback((date: string) => setChosen({ date, at: openedAtRef.current }), []);
  const chosenDate = chosen && (opened === null || chosen.at === null || chosen.at === opened.last) ? chosen.date : null;
  // A page served from the service worker cache was rendered without
  // "?day=" (e.g. opened from a notification): the address still has it.
  // Like a choice, it only applies on the day the app was opened with it.
  const addressDay = useSyncExternalStore(noSubscribe, dayInAddress, () => null);
  const linkDayApplies = opened === null || schoolToday(opened.first) === openedDay;
  // After hydration the address is the truth: a cached page may carry the
  // day it was rendered for.
  const linkDay = opened === null ? initialDay : addressDay;
  const requestedDate = chosenDate ?? (linkDayApplies ? linkDay : null);

  // A notification tapped while the app is open: show its day. Opening the
  // app also clears the number on its icon.
  useEffect(() => {
    const clearBadge = () => {
      if (document.visibilityState === "visible") {
        navigator.clearAppBadge?.().catch(() => undefined);
        // The count the service worker adds new changes to (see sw.js).
        window.caches?.delete("kag-badge").catch(() => undefined);
      }
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      const day = data?.type === "open-url" && data.url ? dayFromUrl(data.url) : null;
      if (day) {
        chooseDate(day);
        // The announced change may not be in the copy on screen yet.
        void forceRefresh();
      }
    };
    clearBadge();
    document.addEventListener("visibilitychange", clearBadge);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      document.removeEventListener("visibilitychange", clearBadge);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [chooseDate, forceRefresh]);

  const days = data?.days ?? [];
  const latestDate = days.at(-1)?.date ?? null;
  const planIsPast = latestDate !== null && isPastDate(latestDate, now);

  // School holidays, a public holiday (NRW) or a day off of the school without a plan for the days
  // ahead yet: a friendly card instead of an old plan that looks out of date.
  const today = now !== null ? schoolToday(now) : null;
  // Decided when the app is opened, like the day shown (no jump while reading).
  const decidedAt = opened?.last ?? now;
  // The school's own days off can be for some classes only (a study day for 5–10).
  const dayOffClass = selectedClass ?? null;
  const holiday =
    today !== null && decidedAt !== null ? holidayBreakAt(today, schoolHour(decidedAt), undefined, dayOffClass) : null;
  const planAhead = today !== null && days.some((day) => day.date >= today);
  // The next school day, when the school has not published it yet: shown as
  // a pale extra tab, so "no changes" is not mistaken for "no plan yet".
  const upcoming = today !== null ? nextSchoolDay(today, undefined, dayOffClass) : null;
  // Also on the weekend after the last plan day (Friday's plan, Monday not
  // there yet), as on Friday evening; in the holidays their card says it all.
  const followsPlan = !holiday && latestDate !== null && nextSchoolDay(latestDate, undefined, dayOffClass) === upcoming;
  // Only for an ordinary (or long) weekend: before the holidays, "not online
  // yet" for a day weeks away would only confuse.
  const upcomingSoon = upcoming !== null && today !== null && daysBetween(today, upcoming) <= 4;
  const pendingDate =
    (planAhead || followsPlan) && upcomingSoon && !days.some((day) => day.date === upcoming)
      ? upcoming
      : null;
  const tabDays: PlanDay[] = pendingDate
    ? [...days, { date: pendingDate, dayLabel: formatWeekday(pendingDate), weekLabel: null }].sort(
        (left, right) => left.date.localeCompare(right.date),
      )
    : days;
  // Before hydration the time (and the class) are unknown: no day is picked,
  // rather than the plan's first day flashing up as the current one.
  const selectedDate = now === null
    ? null
    : tabDays.some((day) => day.date === requestedDate)
    // Keep the user's choice while it is still part of the plan.
    ? requestedDate
    : pickDefaultDate(
        tabDays.map((day) => day.date),
        // Decided when the app is opened, not on every tick: the view does
        // not jump to another day while the user is reading.
        opened?.last ?? now,
        settings.nextDayHour,
      );
  const showsPendingDay = selectedDate !== null && selectedDate === pendingDate;
  const selectedDay = days.find((day) => day.date === selectedDate) ?? null;
  // In the school holidays the card stays, also once the plan after them is
  // online: it offers that plan and the last one before them. A day picked
  // there (or opened from a notification) shows the plan, until the next day.
  const newPlanDate = today !== null ? (days.find((day) => day.date >= today)?.date ?? null) : null;
  const oldPlanDate = today !== null ? (days.findLast((day) => day.date < today)?.date ?? null) : null;
  const picksPlanDay = requestedDate !== null && days.some((day) => day.date === requestedDate);
  // On the last free day, from 16:00 (or earlier, as set), the plan for the
  // first day back comes first, as on an ordinary weekend.
  // Decided when the app is opened, like the day shown.
  const backTomorrow =
    holiday !== null &&
    today !== null &&
    decidedAt !== null &&
    daysBetween(today, holiday.backOn) === 1 &&
    newPlanDate === holiday.backOn &&
    schoolHour(decidedAt) >= Math.min(settings.nextDayHour, NEXT_DAY_FROM_HOUR);
  const holidayMode = Boolean(
    holiday && (!planAhead || (holiday.kind === "holidays" && !backTomorrow)) && !picksPlanDay,
  );
  const showNewPlan = () => {
    if (newPlanDate) chooseDate(newPlanDate);
  };
  const showOldPlan = () => {
    if (oldPlanDate) chooseDate(oldPlanDate);
  };

  // Checked long ago although online and nothing loading: something may be
  // stuck (the app refreshes every few minutes while open).
  const checkStale =
    now !== null &&
    !isBusy &&
    !connectionError &&
    Boolean(data?.lastUpdated) &&
    now - Date.parse(data!.lastUpdated!) > CHECK_STALE_MS;

  let headerStatus: HeaderStatus = "current";
  if (isBusy || now === null) {
    headerStatus = "updating";
  } else if (connectionError) {
    // "Offline" only when the device has no connection; the school's site
    // being down is a disruption the user cannot fix.
    headerStatus = schoolDown ? "disrupted" : "offline";
  } else if (holiday && (!planAhead || holidayMode)) {
    headerStatus =
      holiday.kind === "holidays"
        ? "holiday"
        : holiday.days?.some((day) => publicHolidayName(day.date))
          ? "public-holiday"
          : "day-off";
  } else if (data?.stale) {
    headerStatus = "disrupted";
  } else if (!data || fromDevice) {
    headerStatus = "outdated";
  } else if (planIsPast) {
    // Up to date, but only past days: the next plan is not online yet.
    headerStatus = "waiting";
  } else if (data.error) {
    headerStatus = "incomplete";
  }

  const dateLabel = now === null
    ? "Wird geladen …"
    : holidayMode && holiday
    ? holiday.from === holiday.to || holiday.kind === "public-holiday"
      ? holiday.name
      : `${holiday.name} bis ${formatShortDate(freeUntil(holiday, today))}`
    : showsPendingDay && pendingDate
    ? formatPlanDateLabel(pendingDate, now)
    : selectedDay
    ? formatPlanDateLabel(selectedDay.date, now)
    : isBusy
      ? "Wird geladen …"
      : "–";

  const classEntries =
    data && selectedClass
      ? data.entries
          // A classless row only if it is one of the chosen courses (see classlessEntryFor).
          .filter((entry) =>
            entry.className
              ? entryAppliesToClass(entry.className, selectedClass)
              : classlessEntryFor(entry, selectedClass, teachers),
          )
          .sort(compareEntries)
      : [];
  // Upper school: only the courses of the student's teachers, unless asked.
  const ownEntries = classEntries.filter((entry) => entryMatchesTeachers(entry, teachers));
  const shownEntries = showOtherCourses ? classEntries : ownEntries;
  // Entries without a readable date are shown (and counted) on every day.
  const isOnDay = (entry: { date: string }, date: string | null) =>
    !date || !entry.date || entry.date === date;
  const onSelectedDay = (entry: { date: string }) => now !== null && isOnDay(entry, selectedDate);
  const countsByDate = selectedClass
    ? new Map(
        days.map((day) => [
          day.date,
          shownEntries.filter((entry) => isOnDay(entry, day.date)).length,
        ]),
      )
    : null;
  const visibleEntries = shownEntries.filter(onSelectedDay);
  const compactCards = visibleEntries.length >= COMPACT_FROM;
  // Cards keyed by their content, not by the plan's page numbers (which shift
  // with every upload): a badge keeps its state across refreshes, and an
  // edited entry is a new card with a fresh badge.
  const keyCounts = new Map<string, number>();
  const cardKeys = visibleEntries.map((entry) => {
    const key = entryKey(entry);
    const count = keyCounts.get(key) ?? 0;
    keyCounts.set(key, count + 1);
    return count === 0 ? key : `${key}#${count}`;
  });
  // Added or changed since the user last opened the app.
  // Badges seen long enough on screen are gone (and no longer counted).
  const newKeys = settings.showNewBadges
    ? findNewKeys(seenBaseline, visibleEntries, acknowledgedNew)
    : new Set<string>();
  // Other days with something new: a small dot on their tab.
  const newDates = new Set(
    settings.showNewBadges && selectedClass
      ? days
          .filter((day) => day.date !== selectedDate)
          .filter(
            (day) =>
              findNewKeys(seenBaseline, shownEntries.filter((entry) => entry.date === day.date), acknowledgedNew).size > 0,
          )
          .map((day) => day.date)
      : [],
  );
  const otherCourseCount =
    classEntries.filter(onSelectedDay).length - ownEntries.filter(onSelectedDay).length;
  // Teachers of the own class in the plan, for choosing courses in the introduction.
  const myTeacherSuggestions = Array.from(
    new Set(
      (data?.entries ?? [])
        .filter((entry) => myClass && entryAppliesToClass(entry.className, myClass))
        .map((entry) => normalizeTeacher(entry.teacher))
        .filter((teacher): teacher is string => teacher !== null),
    ),
  );
  const teacherSuggestions = Array.from(
    new Set(
      classEntries
        .map((entry) => normalizeTeacher(entry.teacher))
        .filter((teacher): teacher is string => teacher !== null),
    ),
  );
  const visibleNotices = Array.from(
    new Set(
      (data?.notices ?? [])
        .filter((notice) => !selectedDate || !notice.date || notice.date === selectedDate)
        .map((notice) => notice.text),
    ),
  );
  // The day's changes as text for messengers (also "no changes").
  const getShareText = () =>
    buildShareText({
      schoolClass: selectedClass ?? "",
      dayLabel: selectedDay ? dateLabel : "aktueller Plan",
      entries: visibleEntries,
      ownCoursesOnly: teachers.length > 0 && !showOtherCourses,
      viewingOther: Boolean(viewedClass && myClass && viewedClass !== myClass),
      sourceUpdated: data?.sourceUpdatedAt ? formatTimestamp(data.sourceUpdatedAt, now) : null,
      appUrl: classLink(window.location.origin, selectedClass ?? ""),
      notices: visibleNotices,
    });
  // Told once, over everything, when the app opens; not right after the
  // introduction (that is enough for one visit) and not over the settings.
  const showRoomPlanIntro = onboarding.done && !introducedNow && !settingsOpen && !opensFromAddress;
  const exampleRoom = firstKnownRoom(visibleEntries.map((entry) => entry.room));
  const emptyDayLabel = selectedDay
    ? `Am ${selectedDay.dayLabel ?? formatPlanDateLabel(selectedDay.date, null)}`
    : "Heute";

  return (
    <>
      <PwaRegistrar />
      {wide ? (
        <DesktopView
          data={data}
          now={now}
          isBusy={isBusy}
          connectionError={connectionError}
          schoolDown={schoolDown}
          checkStale={checkStale}
          status={headerStatus}
          opening={opening}
          showInstallReminder={onboarding.done}
          onRefresh={() => void forceRefresh()}
          onOpenSettings={openSettings}
          selectedClass={selectedClass}
          myClass={myClass}
          viewingOther={Boolean(viewedClass && myClass && viewedClass !== myClass)}
          onChooseClass={chooseClass}
          classes={SCHOOL_CLASSES}
          courseFilter={
            usesCourseFilter && selectedClass ? { selected: storedTeachers, active: teachers.length > 0 } : null
          }
          showOtherCourses={showOtherCourses}
          onToggleOtherCourses={() => setShowOtherCourses((value) => !value)}
          classEntries={classEntries}
          ownEntries={ownEntries}
          shownEntries={shownEntries}
          push={push}
          notificationAudience={
            myClass ? `${myClass}${myTeachers.length > 0 ? ` (${myTeachers.join(", ")})` : ""}` : null
          }
          days={tabDays}
          pendingDate={pendingDate}
          focusDate={selectedDate}
          holiday={holiday}
          holidayMode={holidayMode}
          today={today}
          newPlanDate={newPlanDate}
          hasOldPlan={oldPlanDate !== null}
          onShowNewPlan={showNewPlan}
          onShowOldPlan={showOldPlan}
          waiting={headerStatus === "waiting"}
          findNew={(entries) =>
            settings.showNewBadges ? findNewKeys(seenBaseline, entries, acknowledgedNew) : new Set<string>()
          }
          onNewSeen={acknowledgeNewEntry}
        />
      ) : (
        <PullToRefresh onRefresh={forceRefresh}>
          <main
            className={`${opening ? "app-enter " : ""}mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 wide:invisible`}
          >
            <Header
              selectedClass={selectedClass}
              dateLabel={dateLabel}
              weekLabel={holidayMode ? null : (selectedDay?.weekLabel ?? null)}
              dateIsPast={!holidayMode && selectedDate !== null && isPastDate(selectedDate, now)}
              sourceUpdatedLabel={formatTimestamp(data?.sourceUpdatedAt ?? null, now)}
              fetchedLabel={
                data?.lastUpdated ? formatAge(data.lastUpdated, now) : "noch nie"
              }
              checkStale={checkStale}
              status={headerStatus}
              onOpenSettings={() => openSettings()}
            />

            {/* Not during the introduction, which has its own install step. */}
            {onboarding.done ? <InstallReminder /> : null}

            <ClassSelector
              classes={SCHOOL_CLASSES}
              selectedClass={selectedClass}
              onChange={chooseClass}
              viewingOther={Boolean(viewedClass && myClass && viewedClass !== myClass)}
            >
              {viewedClass && myClass && viewedClass !== myClass ? (
                <ViewingOtherNote myClass={myClass} onBack={() => chooseClass(myClass)} className="mt-3" />
              ) : null}
              {usesCourseFilter && selectedClass ? (
                <TeacherHint
                  own={selectedClass === myClass}
                  schoolClass={selectedClass}
                  selected={storedTeachers}
                  onOpenSettings={() => openSettings("teachers")}
                />
              ) : null}
              {/* They are about the own class: not repeated while another is looked at. */}
              {viewedClass && myClass && viewedClass !== myClass ? null : (
                <NotificationSettings
                  push={push}
                  schoolClass={myClass}
                  teachers={myTeachers}
                  onOpenSettings={openSettings}
                />
              )}
            </ClassSelector>

            {data ? (
              <RefreshStatus
                connectionError={connectionError}
                schoolDown={schoolDown}
                stale={data.stale}
                error={data.error}
                lastSuccessLabel={formatAge(
                  data.lastSuccessfulUpdate ?? data.lastUpdated,
                  now,
                )}
                sourceUrl={data.sourceUrl}
                onRetry={() => void forceRefresh()}
              />
            ) : null}

            {headerStatus === "waiting" && !showsPendingDay ? (
              <p className="rounded-[1.4rem] border border-line bg-card px-4 py-3 text-sm leading-6 text-muted">
                Der nächste Plan ist noch nicht online. Bis die Schule ihn hochlädt, siehst du hier
                den letzten Plan.
              </p>
            ) : null}

            {!holidayMode && tabDays.length > 1 && selectedDate ? (
              <DaySelector
                days={tabDays}
                selectedDate={selectedDate}
                onChange={chooseDate}
                counts={countsByDate}
                newDates={newDates}
                now={now}
                pendingDate={pendingDate}
              />
            ) : null}

            {!holidayMode ? <NoticesCard notices={visibleNotices} /> : null}

            {/* Read out after switching day or class: a short summary, not the whole list. */}
            <p role="status" className="sr-only">
              {showsPendingDay
                ? `${dateLabel}: Plan noch nicht online`
                : !holidayMode && data && selectedClass && selectedDay
                ? `${selectedClass}, ${dateLabel}: ${
                    visibleEntries.length === 0
                      ? "keine Änderungen"
                      : visibleEntries.length === 1
                        ? "1 Änderung"
                        : `${visibleEntries.length} Änderungen`
                  }`
                : ""}
            </p>

            <section
              className="space-y-4"
              {...(tabDays.length > 1 && selectedDate
                ? { id: DAY_PANEL_ID, role: "tabpanel", "aria-labelledby": dayTabId(selectedDate) }
                : {})}
            >
              {!data && isBusy ? <LoadingState /> : null}

              {holidayMode && holiday && selectedClass !== null ? (
                <HolidayCard
                  holiday={holiday}
                  today={today}
                  newPlanDate={newPlanDate}
                  hasOldPlan={oldPlanDate !== null}
                  onShowNewPlan={showNewPlan}
                  onShowOldPlan={showOldPlan}
                />
              ) : null}

              {!data && !isBusy ? (
                <div className="rounded-[1.75rem] border border-warn/15 bg-warn-soft p-6 text-center">
                  <p className="text-lg font-semibold text-warn">
                    Vertretungsplan momentan nicht erreichbar.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-warn">
                    {connectionError ?? "Bitte versuche es in ein paar Minuten erneut."}
                  </p>
                  <button
                    type="button"
                    onClick={() => void forceRefresh()}
                    className="mt-4 rounded-full bg-warn px-5 py-2 text-sm font-semibold text-on-warn"
                  >
                    Erneut versuchen
                  </button>
                </div>
              ) : null}

              {data && selectedClass === null ? (
                <div className={cardClassName}>
                  <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                    Wähle deine Klasse
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Dann siehst du hier nur die Vertretungen, die dich betreffen.
                    Die Auswahl wird auf diesem Gerät gespeichert.
                  </p>
                </div>
              ) : null}

              {showsPendingDay && pendingDate ? (
                <div className={cardClassName}>
                  <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                    Plan für {formatWeekday(pendingDate)} noch nicht online
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Die Schule hat den Plan für {formatShortDate(pendingDate)} noch nicht hochgeladen. Er
                    erscheint hier automatisch, sobald er da ist
                    {push.status === "on" ? " – bei Änderungen bekommst du eine Benachrichtigung." : "."}
                  </p>
                </div>
              ) : null}

              {!holidayMode && !showsPendingDay && data && selectedClass ? (
                <DaySummary
                  entries={visibleEntries}
                  newCount={newKeys.size}
                  otherCourses={otherCourseCount}
                  showingOtherCourses={showOtherCourses}
                  onToggleOtherCourses={() => setShowOtherCourses((value) => !value)}
                  getShareText={getShareText}
                  courses={selectedClass ? isCourseClass(selectedClass) : false}
                />
              ) : null}

              {!holidayMode && !showsPendingDay && data && selectedClass ? (
                visibleEntries.length > 0 ? (
                  // Many changes (e.g. the upper school): smaller cards, closer together.
                  <div className={compactCards ? "space-y-2.5" : "space-y-4"}>
                    {visibleEntries.map((entry, index) => (
                      <SubstitutionCard
                        key={cardKeys[index]}
                        entry={entry}
                        isNew={newKeys.has(entryKey(entry))}
                        onNewSeen={() => acknowledgeNewEntry(entryKey(entry))}
                        showClassName={formatClassName(entry.className) !== selectedClass}
                        compact={compactCards}
                        over={now !== null && isLessonOver(entry, now)}
                      />
                    ))}
                  </div>
                ) : tabDays.length === 0 ? (
                  // No day in the plan at all (none uploaded, or no date readable):
                  // "no changes today" would be wrong.
                  <div className={cardClassName}>
                    <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">Kein Plan online</p>
                    <p className="mt-2 text-sm leading-6 text-muted">Die Schule hat gerade keinen Plan hochgeladen.</p>
                  </div>
                ) : (
                  <EmptyDay
                    selectedClass={selectedClass}
                    dayLabel={emptyDayLabel}
                    filtered={teachers.length > 0 && !showOtherCourses}
                    getShareText={getShareText}
                  />
                )
              ) : null}
            </section>

          </main>
        </PullToRefresh>
      )}

      <SettingsSheet
        open={settingsOpen || opensFromAddress}
        onClose={() => {
          setAddressHandled(true);
          setSettingsOpen(false);
        }}
        focus={opensFromAddress ? "share" : settingsFocus}
        notifications={{ push, schoolClass: myClass ?? null, teachers: myTeachers }}
        courseFilter={
          // The upper-school class on screen; otherwise the own one, whose
          // courses the notifications are about.
          usesCourseFilter && selectedClass
            ? {
                schoolClass: selectedClass,
                own: selectedClass === myClass,
                selected: storedTeachers,
                suggestions: teacherSuggestions,
                onChange: (value) => {
                  setShowOtherCourses(false);
                  setTeachers(value);
                },
              }
            : myClass && isCourseClass(myClass)
              ? {
                  schoolClass: myClass,
                  own: true,
                  selected: myStoredTeachers,
                  suggestions: myTeacherSuggestions,
                  onChange: setMyTeachers,
                }
              : null
        }
        sourceUrl={data?.sourceUrl}
        myClass={myClass ?? null}
        onChooseMyClass={chooseMyClass}
        planInfo={
          data
            ? [
                `Stand ${formatTimestamp(data.sourceUpdatedAt ?? null, now)}`,
                ((age) => (age.endsWith("Uhr") ? `geprüft ${age}` : `${age} geprüft`))(formatAge(data.lastUpdated, now)),
                ...(data.stale ? ["Schulseite nicht erreichbar"] : []),
                ...(data.error && !data.stale ? ["unvollständig"] : []),
                ...(fromDevice ? ["Kopie vom Gerät"] : []),
                ...(connectionError ? [schoolDown ? "Schulseite nicht erreichbar" : "keine Verbindung"] : []),
              ].join(", ")
            : "nicht geladen"
        }
        onShowIntroduction={() => {
          setAddressHandled(true);
          setSettingsOpen(false);
          onboarding.restart();
        }}
      />
      <RoomPlanSheet myClass={myClass ?? null} />
      <RoomPlanIntro ready={showRoomPlanIntro} exampleRoom={exampleRoom} />
      {!onboarding.done ? (
        <Onboarding
          myClass={myClass ?? null}
          onChooseClass={chooseMyClass}
          courseTeachers={myStoredTeachers}
          courseSuggestions={myTeacherSuggestions}
          onChangeCourseTeachers={(value) => {
            setShowOtherCourses(false);
            setMyTeachers(value);
          }}
          push={push}
          onFinish={onboarding.finish}
        />
      ) : null}
    </>
  );
}
