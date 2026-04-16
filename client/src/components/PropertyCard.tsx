/**
 * PropertyCard
 * Displays a single property with:
 *   - Address and label
 *   - 360° membership tier badge (or "No Membership")
 *   - Health score dot (green/yellow/red)
 *   - Open job count
 *   - Quick action buttons: View, Edit, Enroll/Manage Membership
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MapPin,
  MoreVertical,
  Star,
  Briefcase,
  ShieldCheck,
  ShieldOff,
  Home,
  Building2,
} from "lucide-react";
import { Property } from "@/lib/types";

// ─── Tier badge config ────────────────────────────────────────────────────────
const TIER_CONFIG = {
  bronze: { label: "Bronze", className: "bg-amber-700 text-white" },
  silver: { label: "Silver", className: "bg-slate-400 text-white" },
  gold: { label: "Gold", className: "bg-yellow-500 text-white" },
} as const;

// ─── Health dot ───────────────────────────────────────────────────────────────
const HEALTH_DOT = {
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  red: "bg-red-500",
} as const;

interface PropertyCardProps {
  property: Property;
  isActive?: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onEnroll: (id: string) => void;
  onManageMembership: (id: string) => void;
}

export default function PropertyCard({
  property,
  isActive,
  onSelect,
  onEdit,
  onDelete,
  onSetPrimary,
  onEnroll,
  onManageMembership,
}: PropertyCardProps) {
  const { membership, healthScore, openJobCount } = property;
  const hasMembership = membership && membership.status === "active";
  const tierCfg = hasMembership ? TIER_CONFIG[membership.tier] : null;
  const healthColor = healthScore?.color ?? "yellow";
  const healthDot = HEALTH_DOT[healthColor];

  const addressLine = [property.street, property.unit].filter(Boolean).join(" ");
  const cityLine = [property.city, property.state, property.zip]
    .filter(Boolean)
    .join(", ");

  const LabelIcon = property.label.toLowerCase().includes("rental")
    ? Building2
    : Home;

  return (
    <Card
      className={`cursor-pointer transition-all border-2 ${
        isActive
          ? "border-primary shadow-md"
          : "border-border hover:border-primary/40 hover:shadow-sm"
      }`}
      onClick={() => onSelect(property.id)}
    >
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <LabelIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-semibold text-sm truncate">{property.label}</span>
            {property.isPrimary && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 shrink-0">
                Primary
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Health dot */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${healthDot} cursor-help`}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px]">
                <p className="font-medium capitalize mb-1">
                  {healthColor === "green"
                    ? "Good standing"
                    : healthColor === "yellow"
                    ? "Needs attention"
                    : "Action required"}
                </p>
                {healthScore?.reasons.map((r, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {r}
                  </p>
                ))}
              </TooltipContent>
            </Tooltip>

            {/* Overflow menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => onEdit(property.id)}>
                  Edit property
                </DropdownMenuItem>
                {!property.isPrimary && (
                  <DropdownMenuItem onClick={() => onSetPrimary(property.id)}>
                    <Star className="h-3.5 w-3.5 mr-2" />
                    Set as primary
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {hasMembership ? (
                  <DropdownMenuItem onClick={() => onManageMembership(property.id)}>
                    <ShieldCheck className="h-3.5 w-3.5 mr-2" />
                    Manage membership
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onEnroll(property.id)}>
                    <ShieldOff className="h-3.5 w-3.5 mr-2" />
                    Enroll in 360°
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => onDelete(property.id)}
                >
                  Delete property
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Address */}
        <div className="flex items-start gap-1.5 mb-3">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground leading-tight">
            {addressLine && <div>{addressLine}</div>}
            {cityLine && <div>{cityLine}</div>}
            {!addressLine && !cityLine && (
              <span className="italic">No address on file</span>
            )}
          </div>
        </div>

        {/* Footer: membership + open jobs */}
        <div className="flex items-center justify-between gap-2">
          {hasMembership && tierCfg ? (
            <Badge className={`text-xs ${tierCfg.className}`}>
              <ShieldCheck className="h-3 w-3 mr-1" />
              360° {tierCfg.label}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">No membership</span>
          )}

          {(openJobCount ?? 0) > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Briefcase className="h-3 w-3" />
              {openJobCount} open job{openJobCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Labor bank balance (if membership) */}
        {hasMembership && (
          <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground flex justify-between">
            <span>Labor bank</span>
            <span className="font-medium text-foreground">
              ${((membership.laborBankBalance ?? 0) / 100).toFixed(2)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
