export const getStoredUser = () => {
    const storedUser = localStorage.getItem("user");

    if (!storedUser) {
        return null;
    }

    try {
        return JSON.parse(storedUser);
    } catch (error) {
        console.warn("Ignoring invalid stored user data:", error);
        localStorage.removeItem("user");
        return null;
    }
};

export const getStoredUserRole = () => {
    const role = getStoredUser()?.role;
    return typeof role === "string" ? role.toLowerCase() : null;
};
