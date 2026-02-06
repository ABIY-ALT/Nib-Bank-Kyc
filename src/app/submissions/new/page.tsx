"use client"

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Upload, FilePlus, Shield, Info } from "lucide-react";

export default function NewSubmission() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      toast({
        title: "Submission Created",
        description: "Your KYC request has been submitted for review.",
      });
      router.push('/submissions');
    }, 1500);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New KYC Submission</h1>
        <p className="text-muted-foreground">Submit a new customer for identity verification.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Customer Information
            </CardTitle>
            <CardDescription>Provide basic legal entity details.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Customer Full Name / Entity</Label>
              <Input id="name" placeholder="Legal Name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Entity Type</Label>
              <Select defaultValue="individual">
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="corporate">Corporate</SelectItem>
                  <SelectItem value="ngo">NGO / Non-Profit</SelectItem>
                  <SelectItem value="government">Government</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch">Originating Branch</Label>
              <Input id="branch" value="Downtown" disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FilePlus className="w-5 h-5 text-primary" />
              Documentation
            </CardTitle>
            <CardDescription>Upload necessary verification documents.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
             <div className="border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-4 hover:bg-accent/5 transition-colors cursor-pointer">
                <div className="bg-primary/10 p-4 rounded-full">
                  <Upload className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-lg">Click to upload files</p>
                  <p className="text-sm text-muted-foreground">or drag and drop files here (PDF, JPG, PNG)</p>
                </div>
                <Button variant="outline" type="button">Select Files</Button>
             </div>

             <div className="flex gap-4 p-4 rounded-lg bg-blue-50 border border-blue-100 text-blue-800 text-sm">
                <Info className="w-5 h-5 shrink-0" />
                <p>Ensure all documents are clearly legible and valid for at least 6 months from today's date.</p>
             </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Initial Remarks</CardTitle>
          </CardHeader>
          <CardContent>
             <Textarea placeholder="Add any initial observations or context for the KYC Officer..." className="min-h-[120px]" />
          </CardContent>
          <CardFooter className="flex justify-end gap-3 border-t pt-6">
            <Button variant="outline" type="button" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Submitting..." : "Submit for Review"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
