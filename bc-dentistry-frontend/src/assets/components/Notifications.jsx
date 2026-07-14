import Alarm from "../images/icons/notifications.png"
import UserType from "./UserType";
import { useEffect, useState } from "react";
import { authHeaders, blockchainUrl, jsonHeaders } from "../config/api";

const Notifications = () => {
    const [notifications, setNotifications] = useState([]);
    const unread = notifications.filter((notification) => notification.status === "UNREAD").length;

    useEffect(() => {
        const loadNotifications = async () => {
            try {
                const response = await fetch(blockchainUrl("/notifications?status=ALL"), {
                    headers: authHeaders(),
                });
                const payload = await response.json();
                if (response.ok) {
                    setNotifications(payload.data || payload || []);
                }
            } catch (error) {
                console.warn("Unable to load notifications", error);
            }
        };
        loadNotifications();
    }, []);

    const markLatestRead = async () => {
        const notification = notifications.find((item) => item.status === "UNREAD");
        if (!notification) return;
        try {
            const response = await fetch(blockchainUrl(`/notifications/${encodeURIComponent(notification.notificationID)}/read`), {
                method: "POST",
                headers: jsonHeaders(),
            });
            const payload = await response.json();
            if (response.ok) {
                setNotifications((items) => items.map((item) => item.notificationID === notification.notificationID ? (payload.data || payload) : item));
            }
        } catch (error) {
            console.warn("Unable to mark notification read", error);
        }
    };

    return (
        <div className="flex items-center gap-x-8">
            {/* <UserType type={"Doctor"} /> */}
            <UserType />
            <button id="Notifications" className="relative w-10 h-10 flex p-2 cursor-pointer" onClick={markLatestRead} title={notifications[0]?.message || "Notifications"}>
                <img src={Alarm} alt="" />
                {unread > 0 && <span className="absolute -top-1 -right-1 text-xs bg-red-600 text-white rounded-full px-1.5">{unread}</span>}
            </button>

        </div>
    )
}

export default Notifications;
