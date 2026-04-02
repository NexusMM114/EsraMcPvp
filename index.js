import { useEffect, useState } from "react"
import { useSession, signIn, signOut } from "next-auth/react"
import clientPromise from "../lib/mongodb"

// ===== FRONTEND =====
export default function Home() {
  const { data: session } = useSession()
  const [modes, setModes] = useState([])
  const [applications, setApplications] = useState([])

  const load = async () => {
    const m = await fetch("/api/all").then(r => r.json())
    setModes(m.modes)
    setApplications(m.apps)
  }

  useEffect(() => { load() }, [])

  const apply = async (mode) => {
    if (!session) return signIn("discord")

    const res = await fetch("/api/apply", {
      method: "POST",
      body: JSON.stringify({
        discordId: session.user.id,
        username: session.user.name,
        pvpMode: mode
      })
    })

    alert((await res.json()).message)
    load()
  }

  const approve = async (id, status) => {
    await fetch("/api/admin", {
      method: "POST",
      body: JSON.stringify({ id, status })
    })
    load()
  }

  return (
    <div style={{ background: "#0f172a", color: "white", minHeight: "100vh", padding: 20 }}>
      <h1>⚔ Tournament Arena</h1>

      {session ? (
        <p>Welcome {session.user.name} <button onClick={signOut}>Logout</button></p>
      ) : (
        <button onClick={() => signIn("discord")}>Login</button>
      )}

      <h2>PvP Modes</h2>
      <div style={{ display: "flex", gap: 20 }}>
        {modes.map(m => (
          <div key={m.slug} style={{ background: "#1e293b", padding: 15 }}>
            <h3>{m.name}</h3>
            <p>{m.currentPlayers}/{m.maxPlayers}</p>

            <button
              disabled={m.currentPlayers >= m.maxPlayers}
              onClick={() => apply(m.slug)}
            >
              {m.currentPlayers >= m.maxPlayers ? "FULL" : "APPLY"}
            </button>
          </div>
        ))}
      </div>

      {/* ===== ADMIN PANEL ===== */}
      <h2 style={{ marginTop: 40 }}>Admin Panel</h2>

      <h3>Create PvP Mode</h3>
      <CreateMode reload={load} />

      <h3>Applications</h3>
      {applications.map(app => (
        <div key={app._id} style={{ marginBottom: 10 }}>
          {app.username} ({app.pvpMode}) - {app.status || "pending"}

          <button onClick={() => approve(app._id, "approved")}>✅</button>
          <button onClick={() => approve(app._id, "rejected")}>❌</button>
        </div>
      ))}
    </div>
  )
}

// ===== CREATE MODE COMPONENT =====
function CreateMode({ reload }) {
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [maxPlayers, setMaxPlayers] = useState(32)

  const create = async () => {
    await fetch("/api/admin", {
      method: "PUT",
      body: JSON.stringify({ name, slug, maxPlayers })
    })
    reload()
  }

  return (
    <div>
      <input placeholder="Name" onChange={e => setName(e.target.value)} />
      <input placeholder="Slug" onChange={e => setSlug(e.target.value)} />
      <input type="number" onChange={e => setMaxPlayers(e.target.value)} />
      <button onClick={create}>Create</button>
    </div>
  )
}

// ===== BACKEND API HANDLERS =====

// /pages/api/all.js
export async function getServerSideProps() {
  const client = await clientPromise
  const db = client.db("tournament")

  const modes = await db.collection("pvpModes").find().toArray()
  const apps = await db.collection("applications").find().toArray()

  for (let m of modes) {
    m.currentPlayers = await db.collection("applications").countDocuments({
      pvpMode: m.slug
    })
  }

  return {
    props: {
      initialModes: JSON.parse(JSON.stringify(modes)),
      initialApps: JSON.parse(JSON.stringify(apps))
    }
  }
}

// ===== API ROUTES =====

// /pages/api/apply.js
export async function applyHandler(req, res) {
  const { discordId, username, pvpMode } = JSON.parse(req.body)

  const client = await clientPromise
  const db = client.db("tournament")

  const mode = await db.collection("pvpModes").findOne({ slug: pvpMode })

  const count = await db.collection("applications").countDocuments({ pvpMode })

  const existing = await db.collection("applications").findOne({
    discordId,
    pvpMode
  })

  if (existing) return res.json({ message: "Already Applied" })
  if (count >= mode.maxPlayers) return res.json({ message: "Slots Full" })

  await db.collection("applications").insertOne({
    discordId,
    username,
    pvpMode,
    status: "pending",
    createdAt: new Date()
  })

  res.json({ message: "Applied" })
}

// /pages/api/admin.js
export async function adminHandler(req, res) {
  const client = await clientPromise
  const db = client.db("tournament")

  if (req.method === "PUT") {
    const { name, slug, maxPlayers } = JSON.parse(req.body)

    await db.collection("pvpModes").insertOne({
      name,
      slug,
      maxPlayers: Number(maxPlayers)
    })

    return res.json({ message: "Created" })
  }

  if (req.method === "POST") {
    const { id, status } = JSON.parse(req.body)

    await db.collection("applications").updateOne(
      { _id: new require("mongodb").ObjectId(id) },
      { $set: { status } }
    )

    return res.json({ message: "Updated" })
  }
}
