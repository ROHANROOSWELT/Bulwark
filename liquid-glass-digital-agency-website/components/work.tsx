"use client"

import { GlassCard } from "@/components/ui/glass-card"
import { motion } from "framer-motion"
import Image from "next/image"

const projects = [
  {
    title: "Neon Finance",
    category: "Fintech App",
    image: "/neon-finance-app-interface-dark-mode.jpg",
    color: "from-blue-500/20 to-cyan-500/20",
  },
  {
    title: "Aura Health",
    category: "Wellness Platform",
    image: "/meditation-app-interface-soft-gradients.jpg",
    color: "from-purple-500/20 to-pink-500/20",
  },
  {
    title: "Orbit Space",
    category: "Aerospace Website",
    image: "/space-website-interface-futuristic.jpg",
    color: "from-orange-500/20 to-red-500/20",
  },
]

export function Work() {
  return (
    <section id="work" className="py-32 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] bg-blue-900/10 rounded-full blur-[150px] pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-20 gap-8">
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-4xl md:text-6xl font-bold mb-6"
            >
              Selected Work
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-white/60 max-w-md"
            >
              A showcase of our most recent digital transformations.
            </motion.p>
          </div>
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="px-6 py-3 rounded-full border border-white/20 hover:bg-white/10 transition-colors text-sm font-medium"
          >
            View All Projects
          </motion.button>
        </div>

        <div className="space-y-20">
          {projects.map((project, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8 }}
            >
              <GlassCard className="p-0 overflow-hidden group">
                <div className="grid md:grid-cols-2 gap-0">
                  <div className={`p-12 flex flex-col justify-center relative overflow-hidden`}>
                    <div className={`absolute inset-0 bg-gradient-to-br ${project.color} opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
                    <div className="relative z-10">
                      <span className="text-sm font-medium text-white/50 mb-4 block uppercase tracking-wider">
                        {project.category}
                      </span>
                      <h3 className="text-4xl md:text-5xl font-bold mb-6 group-hover:translate-x-2 transition-transform duration-500">
                        {project.title}
                      </h3>
                      <p className="text-white/70 mb-8 max-w-md">
                        Redefining the user experience through intuitive design and seamless interactions.
                      </p>
                      <div className="flex items-center gap-4 text-sm font-medium">
                        <span className="px-4 py-2 rounded-full bg-white/5 border border-white/10">UX/UI</span>
                        <span className="px-4 py-2 rounded-full bg-white/5 border border-white/10">Development</span>
                      </div>
                    </div>
                  </div>
                  <div className="relative h-[400px] md:h-auto overflow-hidden">
                    <Image
                      src={project.image || "/placeholder.svg"}
                      alt={project.title}
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500" />
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
