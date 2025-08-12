import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './styles.css'
import App from './App'
import Play from './pages/Play'
import Leaderboard from './pages/Leaderboard'
import About from './pages/About'
const router=createBrowserRouter([{path:'/',element:<App/>,children:[{index:true,element:<Play/>},{path:'leaderboard',element:<Leaderboard/>},{path:'about',element:<About/>}]}])
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={router}/></React.StrictMode>)
