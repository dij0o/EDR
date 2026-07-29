import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { databaseUrl } from "../utils/api";

const UserContext = createContext()
const REFRESH_TOKEN_KEY = "edr.refreshToken";
const PENDING_LOGOUT_KEY = "edr.pendingLogoutToken";

export const UserProvider = ({ children }) => {
    const [ user, setUser ] = useState(null)
    const [ token, setToken ] = useState(null)
    const [ status, setStatus ] = useState("restoring")
    const tokenRef = useRef(null)
    const refreshPromise = useRef(null)

    useEffect(() => { tokenRef.current = token }, [token])

    const clearSession = async () => {
        tokenRef.current = null
        setToken(null)
        setUser(null)
        setStatus("unauthenticated")
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
    }

    const applySession = async (payload) => {
        if (!payload?.token || !payload?.refreshToken) throw new Error("Incomplete session response")
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, payload.refreshToken, {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        })
        tokenRef.current = payload.token
        setToken(payload.token)
        if (payload.user) setUser(payload.user)
        setStatus("authenticated")
        return payload.token
    }

    const refreshSession = async () => {
        if (refreshPromise.current) return refreshPromise.current
        refreshPromise.current = (async () => {
            const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
            if (!refreshToken) throw new Error("No refresh session")
            setStatus("refreshing")
            const response = await axios.post(databaseUrl("/auth/refresh"), { refreshToken }, {
                headers: { "X-EDR-No-Refresh": "true" },
            })
            return applySession(response.data)
        })().catch(async (error) => {
            await clearSession()
            throw error
        }).finally(() => { refreshPromise.current = null })
        return refreshPromise.current
    }

    const signIn = async (email, password) => {
        const existingRefresh = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
        if (existingRefresh) {
            await axios.post(databaseUrl("/auth/logout"), { refreshToken: existingRefresh }, {
                headers: { "X-EDR-No-Refresh": "true" },
            }).catch(() => {})
            await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
        }
        const response = await axios.post(databaseUrl("/login"), {
            email, password, clientType: Platform.OS === "ios" ? "ios" : "android",
            deviceLabel: `${Platform.OS} patient app`,
        }, { headers: { "X-EDR-No-Refresh": "true" } })
        if (response.data.user?.role?.toLowerCase() !== "patient") throw new Error("Patient account required")
        await applySession(response.data)
        return response.data.user
    }

    const logout = async () => {
        const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
        try {
            if (tokenRef.current || refreshToken) {
                const headers = { "X-EDR-No-Refresh": "true" }
                if (tokenRef.current) headers.Authorization = `Bearer ${tokenRef.current}`
                await axios.post(databaseUrl("/auth/logout"), { refreshToken }, { headers })
            }
            await SecureStore.deleteItemAsync(PENDING_LOGOUT_KEY)
        } catch (error) {
            if (refreshToken) await SecureStore.setItemAsync(PENDING_LOGOUT_KEY, refreshToken, {
                keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
            })
        } finally {
            await clearSession()
        }
    }

    useEffect(() => {
        const requestInterceptor = axios.interceptors.request.use((request) => {
            if (tokenRef.current && !request.headers?.["X-EDR-No-Refresh"]) {
                request.headers.Authorization = `Bearer ${tokenRef.current}`
            }
            return request
        })
        const responseInterceptor = axios.interceptors.response.use(
            (response) => response,
            async (error) => {
                const request = error.config
                if (error.response?.status === 401 && request && !request._edrRetried && !request.headers?.["X-EDR-No-Refresh"]) {
                    request._edrRetried = true
                    const nextToken = await refreshSession()
                    request.headers.Authorization = `Bearer ${nextToken}`
                    return axios(request)
                }
                throw error
            },
        )
        ;(async () => {
            try {
                const pendingLogout = await SecureStore.getItemAsync(PENDING_LOGOUT_KEY)
                if (pendingLogout) {
                    await axios.post(databaseUrl("/auth/logout"), { refreshToken: pendingLogout }, {
                        headers: { "X-EDR-No-Refresh": "true" },
                    })
                    await SecureStore.deleteItemAsync(PENDING_LOGOUT_KEY)
                }
                await refreshSession()
                const response = await axios.get(databaseUrl("/auth/me"))
                setUser(response.data?.data || null)
                setStatus("authenticated")
            } catch {
                await clearSession()
            }
        })()
        return () => {
            axios.interceptors.request.eject(requestInterceptor)
            axios.interceptors.response.eject(responseInterceptor)
        }
    }, [])

    return (
        <UserContext.Provider value={{user, setUser, token, setToken, status, signIn, refreshSession, logout, clearSession}}>
            {children}
        </UserContext.Provider>
    )
}



export const useUser = () => useContext(UserContext)
