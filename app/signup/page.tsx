"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { useBranch } from "@/components/utils"
import { useMutation } from "@tanstack/react-query"
import { createCustomerOptions } from "@/lib/query-options/customer"
import { getTokenOptions, linkPaymentMethodOptions } from "@/lib/query-options/payment-method"
import { logApiCall } from "@/lib/api-logger"
import { getBranchCountry } from "@/lib/branches"
import { ArrowLeft, CheckCircle2, User, CreditCard, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import type { CreateCustomer, Customer } from "@/lib/types/customer"

const pcpEndpoint = process.env.NEXT_PUBLIC_PCP_ENDPOINT
const hppEndpoint = process.env.NEXT_PUBLIC_HPP_ENDPOINT
const apiEndpoint = process.env.NEXT_PUBLIC_API_ENDPOINT || "https://api.ezypay.com"

type ApiLogEntry = {
  id: string
  timestamp: string
  method: string
  url: string
  requestBody?: unknown
  response?: unknown
  status: number
  step: string
}

export default function SignUpPage() {
  const router = useRouter()
  const branch = useBranch()
  const [step, setStep] = useState<"personal" | "payment" | "complete">("personal")
  const [apiLogs, setApiLogs] = useState<ApiLogEntry[]>([])
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [iframeUrl, setIframeUrl] = useState<string | null>(null)
  const [country, setCountry] = useState("")
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const iframeOriginRef = useRef<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  })

  useEffect(() => {
    if (branch) {
      setCountry(getBranchCountry(branch))
    }
  }, [branch])

  // Add log entry helper
  const addLog = (log: Omit<ApiLogEntry, "id" | "timestamp">) => {
    const newLog: ApiLogEntry = {
      ...log,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
    }
    setApiLogs((prev) => [...prev, newLog])
  }

  // Create Customer Mutation
  const createCustomerMutation = useMutation({
    ...createCustomerOptions(branch),
    onMutate: (variables) => {
      addLog({
        method: "POST",
        url: `${apiEndpoint}/v2/billing/customers`,
        requestBody: variables.customerData,
        status: 0,
        step: "Creating Customer",
      })
    },
    onSuccess: (data: Customer) => {
      setCustomerId(data.id)
      // Update the log with response
      setApiLogs((prev) => {
        const updated = [...prev]
        const lastLog = updated[updated.length - 1]
        if (lastLog) {
          lastLog.response = data
          lastLog.status = 201
        }
        return updated
      })
      logApiCall(
        "POST",
        `${apiEndpoint}/v2/billing/customers`,
        data,
        201,
        { firstName: formData.firstName, lastName: formData.lastName, email: formData.email }
      )
      toast.success("Customer created successfully!")
      setStep("payment")
      // Now get the token for payment capture
      getTokenMutation.mutate({ customerId: data.id })
    },
    onError: (error) => {
      setApiLogs((prev) => {
        const updated = [...prev]
        const lastLog = updated[updated.length - 1]
        if (lastLog) {
          lastLog.response = { error: error.message }
          lastLog.status = 400
        }
        return updated
      })
      toast.error("Failed to create customer")
    },
  })

  // Get Token Mutation (for payment capture iframe)
  const getTokenMutation = useMutation({
    ...getTokenOptions(branch),
    onMutate: () => {
      addLog({
        method: "POST",
        url: `${apiEndpoint}/v2/oauth/token`,
        requestBody: { grant_type: "client_credentials" },
        status: 0,
        step: "Getting OAuth Token",
      })
    },
    onSuccess: (data, input) => {
      setApiLogs((prev) => {
        const updated = [...prev]
        const lastLog = updated[updated.length - 1]
        if (lastLog) {
          lastLog.response = { access_token: "***REDACTED***", token_type: "Bearer", expires_in: 3600 }
          lastLog.status = 200
        }
        return updated
      })

      const token = data.access_token
      const custId = input?.customerId || customerId
      const pcpUrl =
        country === "PH"
          ? `${hppEndpoint}/paymentmethod/embed?token=${token}&countryCode=${country}`
          : `${pcpEndpoint}/paymentmethod/embed?token=${token}&feepricing=true&submitbutton=true${
              custId ? "&customerId=" + custId : ""
            }`
      setIframeUrl(pcpUrl)

      addLog({
        method: "GET",
        url: pcpUrl.replace(/token=[^&]*/, "token=***REDACTED***"),
        status: 200,
        step: "Loading Payment Capture Page",
        response: "Payment capture iframe loaded",
      })

      try {
        const url = new URL(pcpUrl)
        iframeOriginRef.current = url.origin
      } catch (_e) {
        iframeOriginRef.current = null
      }
    },
    onError: (error) => {
      setApiLogs((prev) => {
        const updated = [...prev]
        const lastLog = updated[updated.length - 1]
        if (lastLog) {
          lastLog.response = { error: error.message }
          lastLog.status = 401
        }
        return updated
      })
      toast.error("Error getting payment token")
    },
  })

  // Link Payment Method Mutation
  const linkPaymentMethodMutation = useMutation({
    ...linkPaymentMethodOptions(branch),
    onMutate: (variables) => {
      addLog({
        method: "POST",
        url: `${apiEndpoint}/v2/billing/customers/${variables.customerId}/paymentmethods`,
        requestBody: { paymentMethodToken: variables.paymentMethodToken },
        status: 0,
        step: "Linking Payment Method",
      })
    },
    onSuccess: (data) => {
      setApiLogs((prev) => {
        const updated = [...prev]
        const lastLog = updated[updated.length - 1]
        if (lastLog) {
          lastLog.response = data
          lastLog.status = 201
        }
        return updated
      })
      toast.success("Payment method linked successfully!")
      setStep("complete")
    },
    onError: (error) => {
      setApiLogs((prev) => {
        const updated = [...prev]
        const lastLog = updated[updated.length - 1]
        if (lastLog) {
          lastLog.response = { error: error.message }
          lastLog.status = 400
        }
        return updated
      })
      toast.error("Failed to link payment method")
    },
  })

  // Listen for payment method success from iframe
  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      let listenerResponse = e.data
      if (typeof listenerResponse === "string") {
        try {
          listenerResponse = JSON.parse(listenerResponse)
        } catch {
          return
        }
      }

      // Handle success message from iframe
      if (listenerResponse.type === "success" || listenerResponse.paymentMethodToken) {
        const paymentMethodToken = listenerResponse.paymentMethodToken || listenerResponse.token
        if (paymentMethodToken && customerId) {
          linkPaymentMethodMutation.mutate({ customerId, paymentMethodToken })
        } else if (listenerResponse.type === "success") {
          setStep("complete")
        }
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [customerId])

  const handlePersonalInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const customerData: CreateCustomer = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      mobilePhone: formData.phone || undefined,
    }
    createCustomerMutation.mutate({ customerData })
  }

  const getStatusColor = (status: number) => {
    if (status === 0) return "bg-blue-500/10 text-blue-600 dark:text-blue-400"
    if (status >= 200 && status < 300) return "bg-green-500/10 text-green-600 dark:text-green-400"
    if (status >= 400) return "bg-red-500/10 text-red-600 dark:text-red-400"
    return "bg-gray-500/10 text-gray-600 dark:text-gray-400"
  }

  const getMethodColor = (method: string) => {
    switch (method) {
      case "GET":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400"
      case "POST":
        return "bg-green-500/10 text-green-600 dark:text-green-400"
      case "PUT":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400"
      case "DELETE":
        return "bg-red-500/10 text-red-600 dark:text-red-400"
      default:
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400"
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center gap-4 px-4 py-4">
          <Button variant="ghost" size="icon" asChild className="bg-transparent">
            <Link href="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">Customer Sign Up</h1>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left Column - Sign Up Form */}
          <div className="space-y-6">
            {/* Progress Steps */}
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 ${step === "personal" ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "personal" ? "bg-primary text-primary-foreground" : step !== "personal" ? "bg-green-500 text-white" : "bg-muted"}`}>
                  {step !== "personal" ? <CheckCircle2 className="h-5 w-5" /> : <User className="h-4 w-4" />}
                </div>
                <span className="text-sm font-medium">Personal Info</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className={`flex items-center gap-2 ${step === "payment" ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "payment" ? "bg-primary text-primary-foreground" : step === "complete" ? "bg-green-500 text-white" : "bg-muted"}`}>
                  {step === "complete" ? <CheckCircle2 className="h-5 w-5" /> : <CreditCard className="h-4 w-4" />}
                </div>
                <span className="text-sm font-medium">Payment Method</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className={`flex items-center gap-2 ${step === "complete" ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "complete" ? "bg-green-500 text-white" : "bg-muted"}`}>
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">Complete</span>
              </div>
            </div>

            {/* Step 1: Personal Information */}
            {step === "personal" && (
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>Enter your details to create an account</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handlePersonalInfoSubmit} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name *</Label>
                        <Input
                          id="firstName"
                          value={formData.firstName}
                          onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                          required
                          placeholder="John"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name *</Label>
                        <Input
                          id="lastName"
                          value={formData.lastName}
                          onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                          required
                          placeholder="Doe"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                        placeholder="john@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+1 234 567 8900"
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={createCustomerMutation.isPending}
                    >
                      {createCustomerMutation.isPending ? (
                        <>
                          <Spinner className="mr-2 h-4 w-4" />
                          Creating Account...
                        </>
                      ) : (
                        "Continue to Payment"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Payment Method */}
            {step === "payment" && (
              <Card>
                <CardHeader>
                  <CardTitle>Add Payment Method</CardTitle>
                  <CardDescription>Add your payment method for recurring billing</CardDescription>
                </CardHeader>
                <CardContent>
                  {getTokenMutation.isPending ? (
                    <div className="flex h-[400px] items-center justify-center">
                      <Spinner className="h-8 w-8" />
                    </div>
                  ) : iframeUrl ? (
                    <iframe
                      ref={iframeRef}
                      src={iframeUrl}
                      className="h-[500px] w-full rounded-lg border border-border"
                      title="Add Payment Method"
                      sandbox="allow-scripts allow-same-origin allow-forms"
                    />
                  ) : (
                    <div className="flex h-[400px] items-center justify-center text-muted-foreground">
                      Failed to load payment form
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Step 3: Complete */}
            {step === "complete" && (
              <Card>
                <CardHeader className="text-center">
                  <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                  </div>
                  <CardTitle>Sign Up Complete!</CardTitle>
                  <CardDescription>Your account has been created successfully</CardDescription>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                  <p className="text-muted-foreground">
                    Thank you for signing up, {formData.firstName}! Your payment method has been added and you&apos;re ready to start using our services.
                  </p>
                  <Button asChild>
                    <Link href="/">Return to Marketplace</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - API Logs */}
          <div className="space-y-4">
            <Card className="sticky top-4">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">API Request / Response Log</CardTitle>
                  <Badge variant="secondary">{apiLogs.length} calls</Badge>
                </div>
                <CardDescription>Real-time view of API calls during sign-up</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  {apiLogs.length === 0 ? (
                    <div className="flex h-[200px] items-center justify-center text-muted-foreground text-sm">
                      API calls will appear here as you complete the sign-up process
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {apiLogs.map((log) => (
                        <div key={log.id} className="rounded-lg border border-border p-4 space-y-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={getMethodColor(log.method)}>{log.method}</Badge>
                            <Badge className={getStatusColor(log.status)}>
                              {log.status === 0 ? "Pending..." : log.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-primary">{log.step}</div>
                          <div className="text-xs text-muted-foreground break-all font-mono bg-muted/30 p-2 rounded">
                            {log.url}
                          </div>
                          {log.requestBody && (
                            <div>
                              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">Request Body:</p>
                              <pre className="text-xs font-mono bg-muted/30 p-2 rounded overflow-x-auto">
                                {JSON.stringify(log.requestBody, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.response && (
                            <div>
                              <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">Response:</p>
                              <pre className="text-xs font-mono bg-muted/30 p-2 rounded overflow-x-auto max-h-48">
                                {JSON.stringify(log.response, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
