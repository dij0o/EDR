import Alarm from "../images/icons/notifications.png";
import UserType from "./UserType";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authHeaders, databaseUrl, jsonHeaders } from "../config/api";
import {
    enableWebPush,
    getPushBackendStatus,
    isCurrentPushDevice,
    isWebPushConfigured,
    listPushDevices,
    removePushDevice,
    subscribeToForegroundPush,
} from "../../config/firebaseMessaging";

const deepLinkForNotification = (notification) => {
    const requestID = notification.relatedRequestID || notification.payload?.requestID;
    const query = requestID ? `?requestId=${encodeURIComponent(requestID)}` : "";
    if (notification.type === "ACCESS_REQUEST_PENDING_ADMIN") return `/datarequests${query}`;
    if (notification.recipientRole === "doctor" && notification.payload?.patientID) {
        return `/patients/${encodeURIComponent(notification.payload.patientID)}${query}`;
    }
    if (notification.recipientRole === "patient") return `/my-record${query}`;
    return "/dashboard";
};

const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? String(timestamp) : date.toLocaleString();
};

const Notifications = () => {
    const navigate = useNavigate();
    const containerRef = useRef(null);
    const [notifications, setNotifications] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [pushState, setPushState] = useState("checking");
    const [showDevices, setShowDevices] = useState(false);
    const [devices, setDevices] = useState([]);
    const unread = notifications.filter((notification) => notification.status === "UNREAD").length;

    const loadNotifications = useCallback(async ({ quiet = false } = {}) => {
        if (!quiet) setLoading(true);
        try {
            const response = await fetch(databaseUrl("/notifications?status=ALL"), { headers: authHeaders() });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error?.message || "Unable to load notifications.");
            setNotifications(payload.data || payload || []);
            setError("");
        } catch (loadError) {
            setError(loadError.message);
        } finally {
            if (!quiet) setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadNotifications();
        const interval = window.setInterval(() => loadNotifications({ quiet: true }), 30000);
        const onVisible = () => { if (document.visibilityState === "visible") loadNotifications({ quiet: true }); };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [loadNotifications]);

    useEffect(() => {
        const closeOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
        };
        document.addEventListener("mousedown", closeOutside);
        return () => document.removeEventListener("mousedown", closeOutside);
    }, []);

    useEffect(() => {
        let unsubscribe = () => {};
        getPushBackendStatus().then((status) => {
            const configured = status.configured && isWebPushConfigured();
            setPushState(!configured ? "unavailable" : Notification.permission === "granted" ? "enabled" : "available");
        }).catch(() => setPushState("unavailable"));
        subscribeToForegroundPush((payload) => {
            loadNotifications({ quiet: true });
            if (Notification.permission === "granted" && payload?.notification) {
                const foreground = new Notification(payload.notification.title || "EDR notification", {
                    body: payload.notification.body,
                    data: payload.data,
                });
                foreground.onclick = () => {
                    window.focus();
                    navigate(payload.data?.deepLink || "/dashboard");
                    foreground.close();
                };
            }
        })
            .then((cleanup) => { unsubscribe = cleanup; })
            .catch(() => {});
        return () => unsubscribe();
    }, [loadNotifications, navigate]);

    const markRead = async (notification) => {
        if (notification.status !== "UNREAD") return notification;
        const response = await fetch(databaseUrl(`/notifications/${encodeURIComponent(notification.notificationID)}/read`), {
            method: "POST",
            headers: jsonHeaders(),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message || "Unable to mark notification as read.");
        const updated = payload.data || payload;
        setNotifications((items) => items.map((item) => item.notificationID === notification.notificationID ? updated : item));
        return updated;
    };

    const openNotification = async (notification) => {
        try {
            await markRead(notification);
            setOpen(false);
            navigate(deepLinkForNotification(notification));
        } catch (actionError) {
            setError(actionError.message);
        }
    };

    const enablePush = async () => {
        setPushState("enabling");
        try {
            await enableWebPush();
            setPushState("enabled");
            setDevices(await listPushDevices());
            setError("");
        } catch (pushError) {
            setPushState("available");
            setError(pushError.message);
        }
    };

    const toggleDevices = async () => {
        const next = !showDevices;
        setShowDevices(next);
        if (!next) return;
        try {
            setDevices(await listPushDevices());
            setError("");
        } catch (deviceError) {
            setError(deviceError.message);
        }
    };

    const removeDevice = async (subscriptionID) => {
        try {
            const current = isCurrentPushDevice(subscriptionID);
            await removePushDevice(subscriptionID);
            setDevices((items) => items.filter((item) => item.id !== subscriptionID));
            if (current) setPushState("available");
            setError("");
        } catch (deviceError) {
            setError(deviceError.message);
        }
    };

    return (
        <div className="flex items-center gap-x-3 sm:gap-x-5">
            <UserType />
            <div ref={containerRef} className="relative">
                <button
                    id="Notifications"
                    type="button"
                    aria-label={`${unread} unread notifications`}
                    aria-expanded={open}
                    aria-controls="notification-panel"
                    className="relative flex h-10 w-10 cursor-pointer p-2"
                    onClick={() => setOpen((value) => !value)}
                >
                    <img src={Alarm} alt="" aria-hidden="true" />
                    {unread > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{unread}</span>}
                    <span className="sr-only" aria-live="polite">{unread} unread notifications</span>
                </button>

                {open && (
                    <section id="notification-panel" aria-label="Notifications" className="absolute right-0 z-[80] mt-3 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                        <header className="flex items-center justify-between border-b px-4 py-3">
                            <div>
                                <h2 className="font-bold text-gray-900">Notifications</h2>
                                <p className="text-xs text-gray-500">{unread} unread</p>
                            </div>
                            {pushState === "available" && (
                                <button type="button" onClick={enablePush} className="rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white">Enable browser push</button>
                            )}
                            {pushState === "enabling" && <span className="text-xs text-gray-500">Enabling push…</span>}
                            {pushState === "enabled" && <span className="text-xs font-semibold text-green-700">Push enabled</span>}
                        </header>
                        <div className="flex justify-end border-b px-4 py-2">
                            <button type="button" onClick={toggleDevices} className="text-xs font-semibold text-blue-700 hover:underline">
                                {showDevices ? "Back to notifications" : "Manage notification devices"}
                            </button>
                        </div>

                        {error && <p role="alert" className="border-b bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
                        {showDevices ? (
                            <div className="max-h-96 overflow-y-auto">
                                {devices.length === 0 && <p className="p-6 text-center text-sm text-gray-600">No active notification devices.</p>}
                                {devices.map((device) => (
                                    <div key={device.id} className="flex items-start justify-between gap-3 border-b px-4 py-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold capitalize text-gray-900">{device.platform} device {isCurrentPushDevice(device.id) ? "(this browser)" : ""}</p>
                                            <p className="truncate text-xs text-gray-500" title={device.deviceLabel || ""}>{device.deviceLabel || "Unnamed device"}</p>
                                            <p className="mt-1 text-xs text-gray-500">Last synchronized {formatTimestamp(device.updatedAt)}</p>
                                        </div>
                                        <button type="button" onClick={() => removeDevice(device.id)} className="shrink-0 rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700">Remove</button>
                                    </div>
                                ))}
                            </div>
                        ) : <div className="max-h-96 overflow-y-auto">
                            {loading && <p role="status" className="p-4 text-sm text-gray-600">Loading notifications…</p>}
                            {!loading && notifications.length === 0 && <p className="p-6 text-center text-sm text-gray-600">No notifications yet.</p>}
                            {!loading && notifications.map((notification) => (
                                <button
                                    key={notification.notificationID}
                                    type="button"
                                    onClick={() => openNotification(notification)}
                                    className={`block w-full border-b px-4 py-3 text-left hover:bg-blue-50 focus-visible:bg-blue-50 ${notification.status === "UNREAD" ? "bg-blue-50/50" : "bg-white"}`}
                                >
                                    <span className="flex items-start gap-3">
                                        <span aria-hidden="true" className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notification.status === "UNREAD" ? "bg-blue-700" : "bg-transparent"}`} />
                                        <span>
                                            <span className="block text-sm font-semibold text-gray-900">{notification.message || "EDR notification"}</span>
                                            <span className="mt-1 block text-xs text-gray-500">{formatTimestamp(notification.createdAt)}</span>
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>}
                    </section>
                )}
            </div>
        </div>
    );
};

export { deepLinkForNotification };
export default Notifications;
